import { getSqlWithin, type Sql } from "@/lib/db";
import {
  demandSnapshot,
  median,
  type DemandSnapshot,
  type DemandSignals,
  type SlaSignals,
} from "@/lib/demand-heat";
import { parentMatchScore, type ParentMatchPrefs } from "@/lib/parent-match";
import { parentUrgencyScore, type ParentUrgencyPrefs } from "@/lib/parent-urgency";
import type { Daycare } from "@/lib/types";

export type RankSignals = {
  replyMedianHours: number | null;
  replySample: number;
  inquiries28d: number;
  tours28d: number;
  bookings28d: number;
  pendingTourOverdue: number;
  unrepliedThreads: number;
  loaded: boolean;
};

const EMPTY_SIGNALS: RankSignals = {
  replyMedianHours: null,
  replySample: 0,
  inquiries28d: 0,
  tours28d: 0,
  bookings28d: 0,
  pendingTourOverdue: 0,
  unrepliedThreads: 0,
  loaded: false,
};

type ReplyRow = {
  daycare_id: string;
  parent_at: string | null;
  provider_at: string | null;
};

function hoursBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / (60 * 60 * 1000);
}

export async function loadRankSignals(sql: Sql, daycareIds: string[]): Promise<Map<string, RankSignals>> {
  const out = new Map<string, RankSignals>();
  if (!daycareIds.length) return out;
  const wanted = new Set(daycareIds);
  const mark = (id: string) => {
    const cur = out.get(id) ?? { ...EMPTY_SIGNALS, loaded: true };
    cur.loaded = true;
    out.set(id, cur);
    return cur;
  };

  const replies = await sql
    .query<ReplyRow>(
      `select c.daycare_id,
              (select min(m.created_at) from messages m
                where m.conversation_id = c.id and m.sender = 'parent') as parent_at,
              (select min(m.created_at) from messages m
                where m.conversation_id = c.id and m.sender = 'provider') as provider_at
       from conversations c
       where c.daycare_id = any($1::text[])`,
      [daycareIds],
    )
    .catch(() => [] as ReplyRow[]);

  const hoursByCentre = new Map<string, number[]>();
  for (const row of replies) {
    if (!wanted.has(row.daycare_id)) continue;
    const cur = mark(row.daycare_id);
    const hours = hoursBetween(row.parent_at, row.provider_at);
    if (hours == null) {
      if (row.parent_at && !row.provider_at) cur.unrepliedThreads += 1;
      continue;
    }
    const list = hoursByCentre.get(row.daycare_id) ?? [];
    list.push(hours);
    hoursByCentre.set(row.daycare_id, list);
  }
  for (const [id, hours] of hoursByCentre) {
    const cur = mark(id);
    cur.replySample = hours.length;
    const mid = median(hours);
    cur.replyMedianHours = mid == null ? null : Math.round(mid * 10) / 10;
  }

  const since28 = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const sinceTourSla = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const inquiries = await sql
    .query<{ daycare_id: string; n: number }>(
      `select c.daycare_id, count(distinct c.id)::int as n
       from conversations c
       join messages m on m.conversation_id = c.id and m.sender = 'parent'
       where c.daycare_id = any($1::text[])
         and m.created_at > $2::timestamptz
       group by c.daycare_id`,
      [daycareIds, since28],
    )
    .catch(() => [] as Array<{ daycare_id: string; n: number }>);
  for (const row of inquiries) {
    if (!wanted.has(row.daycare_id)) continue;
    mark(row.daycare_id).inquiries28d = Number(row.n) || 0;
  }

  const tours = await sql
    .query<{ daycare_id: string; recent: number; overdue: number }>(
      `select daycare_id,
              count(*) filter (where created_at > $2::timestamptz)::int as recent,
              count(*) filter (
                where status = 'pending' and created_at < $3::timestamptz
              )::int as overdue
       from tour_requests
       where daycare_id = any($1::text[])
       group by daycare_id`,
      [daycareIds, since28, sinceTourSla],
    )
    .catch(() => [] as Array<{ daycare_id: string; recent: number; overdue: number }>);
  for (const row of tours) {
    if (!wanted.has(row.daycare_id)) continue;
    const cur = mark(row.daycare_id);
    cur.tours28d = Number(row.recent) || 0;
    cur.pendingTourOverdue = Number(row.overdue) || 0;
  }

  const bookings = await sql
    .query<{ daycare_id: string; n: number }>(
      `select daycare_id, count(*)::int as n
       from bookings
       where daycare_id = any($1::text[])
         and created_at > $2::timestamptz
       group by daycare_id`,
      [daycareIds, since28],
    )
    .catch(() => [] as Array<{ daycare_id: string; n: number }>);
  for (const row of bookings) {
    if (!wanted.has(row.daycare_id)) continue;
    mark(row.daycare_id).bookings28d = Number(row.n) || 0;
  }

  for (const id of daycareIds) {
    if (!out.has(id)) out.set(id, { ...EMPTY_SIGNALS, loaded: true });
  }
  return out;
}

export function applyRankFields<T extends Daycare>(
  item: T,
  signals: RankSignals | undefined,
  prefs: ParentMatchPrefs & ParentUrgencyPrefs,
): T & {
  matchScore: number;
  urgencyScore: number;
  replyMedianHours: number | null;
  replySample: number;
} {
  const reply = {
    replyMedianHours: signals?.replyMedianHours ?? null,
    replySample: signals?.replySample ?? 0,
  };
  const scored = { ...item, ...reply };
  return {
    ...scored,
    matchScore: parentMatchScore(scored, prefs),
    urgencyScore: parentUrgencyScore(scored, prefs),
    replyMedianHours: reply.replyMedianHours,
    replySample: reply.replySample,
  };
}

export async function overlayParentRank<T extends Daycare>(
  items: T[],
  prefs: ParentMatchPrefs & ParentUrgencyPrefs,
): Promise<
  Array<
    T & {
      matchScore: number;
      urgencyScore: number;
      replyMedianHours: number | null;
      replySample: number;
    }
  >
> {
  if (!items.length) return items.map((item) => applyRankFields(item, undefined, prefs));
  try {
    const sql = await getSqlWithin();
    const ids = [...new Set(items.map((item) => item.id).filter(Boolean))];
    const signals = await loadRankSignals(sql, ids);
    return items.map((item) => applyRankFields(item, signals.get(item.id), prefs));
  } catch {
    return items.map((item) => applyRankFields(item, undefined, prefs));
  }
}

export function snapshotFromSignals(item: Daycare, signals?: RankSignals): DemandSnapshot {
  const demand: DemandSignals = signals?.loaded
    ? {
        loaded: true,
        inquiries28d: signals.inquiries28d,
        tours28d: signals.tours28d,
        bookings28d: signals.bookings28d,
      }
    : { loaded: false };
  const sla: SlaSignals = signals?.loaded
    ? {
        loaded: true,
        replyMedianHours: signals.replyMedianHours,
        replySample: signals.replySample,
        pendingTourOverdue: signals.pendingTourOverdue,
        unrepliedThreads: signals.unrepliedThreads,
      }
    : { loaded: false };
  return demandSnapshot(item, demand, sla);
}

export async function overlayDemandSnapshots<T extends Daycare>(
  items: T[],
): Promise<Array<T & { demand: DemandSnapshot }>> {
  if (!items.length) return items.map((item) => ({ ...item, demand: snapshotFromSignals(item) }));
  try {
    const sql = await getSqlWithin();
    const ids = [...new Set(items.map((item) => item.id).filter(Boolean))];
    const signals = await loadRankSignals(sql, ids);
    return items.map((item) => ({
      ...item,
      demand: snapshotFromSignals(item, signals.get(item.id)),
    }));
  } catch {
    return items.map((item) => ({ ...item, demand: snapshotFromSignals(item) }));
  }
}
