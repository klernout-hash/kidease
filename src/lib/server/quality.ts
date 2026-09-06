import { getSql, type Sql } from "@/lib/db";
import { loadParentReviewStats } from "@/lib/server/reviews";
import {
  applyQualityFields,
  assignGuestFavorites,
  type QualityInput,
} from "@/lib/quality";

export type EngagementStats = {
  tourDecided: number;
  tourAccepted: number;
  threadCount: number;
  threadReplied: number;
};

const EMPTY_ENGAGEMENT: EngagementStats = {
  tourDecided: 0,
  tourAccepted: 0,
  threadCount: 0,
  threadReplied: 0,
};

export async function loadEngagementStats(
  sql: Sql,
  daycareIds: string[],
): Promise<Map<string, EngagementStats>> {
  const out = new Map<string, EngagementStats>();
  if (!daycareIds.length) return out;
  const wanted = new Set(daycareIds);

  const tours = await sql.query<{ daycare_id: string; status: string }>(
    `select daycare_id, status from tour_requests
     where status in ('accepted', 'declined')
       and daycare_id = any($1::text[])`,
    [daycareIds],
  ).catch(() => [] as Array<{ daycare_id: string; status: string }>);

  for (const row of tours) {
    if (!wanted.has(row.daycare_id)) continue;
    const cur = out.get(row.daycare_id) ?? { ...EMPTY_ENGAGEMENT };
    cur.tourDecided += 1;
    if (row.status === "accepted") cur.tourAccepted += 1;
    out.set(row.daycare_id, cur);
  }

  const threads = await sql.query<{
    daycare_id: string;
    threads: number;
    replied: number;
  }>(
    `select c.daycare_id,
            count(*)::int as threads,
            count(*) filter (
              where exists (
                select 1 from messages m
                where m.conversation_id = c.id and m.sender = 'provider'
              )
            )::int as replied
     from conversations c
     where c.daycare_id = any($1::text[])
     group by c.daycare_id`,
    [daycareIds],
  ).catch(() => [] as Array<{ daycare_id: string; threads: number; replied: number }>);

  for (const row of threads) {
    if (!wanted.has(row.daycare_id)) continue;
    const cur = out.get(row.daycare_id) ?? { ...EMPTY_ENGAGEMENT };
    cur.threadCount = Number(row.threads) || 0;
    cur.threadReplied = Number(row.replied) || 0;
    out.set(row.daycare_id, cur);
  }

  return out;
}

async function persistQuality(
  sql: Sql,
  items: Array<{ id: string; qualityScore?: number; guestFavorite?: boolean }>,
) {
  for (const item of items) {
    if (typeof item.qualityScore !== "number") continue;
    await sql`
      update daycares
      set quality_score = ${item.qualityScore},
          guest_favorite = ${Boolean(item.guestFavorite)},
          quality_scored_at = now()
      where id = ${item.id}
    `.catch(() => undefined);
  }
}

export async function overlayQuality<T extends QualityInput>(
  items: T[],
  opts?: { persist?: boolean; persistIds?: string[] },
): Promise<Array<T & { qualityScore: number; guestFavorite: boolean }>> {
  if (!items.length) return items.map((item) => applyQualityFields(item));
  try {
    const sql = await getSql();
    const ids = [...new Set(items.map((item) => item.id).filter(Boolean))];
    const [engagement, reviews] = await Promise.all([
      loadEngagementStats(sql, ids),
      loadParentReviewStats(sql, ids),
    ]);
    const scored = items.map((item) => {
      const stats = engagement.get(item.id);
      const parent = reviews.get(item.id);
      return applyQualityFields(
        {
          ...item,
          parentRatingX10: item.parentRatingX10 || parent?.parentRatingX10 || 0,
          parentReviewCount: item.parentReviewCount || parent?.parentReviewCount || 0,
        },
        stats,
      );
    });
    const marked = assignGuestFavorites(scored);
    if (opts?.persist) {
      const persistIds = new Set(opts.persistIds ?? items.map((item) => item.id));
      await persistQuality(
        sql,
        marked.filter((item) => persistIds.has(item.id)),
      );
    }
    return marked;
  } catch {
    return assignGuestFavorites(items.map((item) => applyQualityFields(item)));
  }
}
