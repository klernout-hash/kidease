import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { staffTimesheetsEnabled } from "@/lib/features";
import {
  planClockIn,
  planClockOut,
  planTimesheetEdit,
  torontoWeek,
  weeklyTotals,
  timesheetCsv,
  type TimeEntry,
} from "@/lib/timesheet";
import { nid } from "@/lib/utils";

type EntryRow = {
  id: string;
  staff_name: string;
  clock_in_at: string;
  clock_out_at: string | null;
};

type EditRow = {
  id: string;
  entry_id: string;
  field_name: string;
  before_value: string;
  after_value: string;
  note: string;
  created_at: string;
  actor_name: string | null;
};

function fail(code: string): never {
  throw new Error(`timesheet:${code}`);
}

async function ensureTimesheetTables() {
  const sql = await getSql();
  await sql`
    create table if not exists staff_time_entries (
      id text primary key,
      daycare_id text not null,
      staff_name text not null,
      clock_in_at timestamptz not null,
      clock_out_at timestamptz,
      created_by text not null,
      created_at timestamptz not null default now()
    )
  `.catch(() => undefined);
  await sql`
    create table if not exists staff_time_edits (
      id text primary key,
      entry_id text not null,
      daycare_id text not null,
      actor_id text not null,
      field_name text not null,
      before_value text not null default '',
      after_value text not null default '',
      note text not null default '',
      created_at timestamptz not null default now()
    )
  `.catch(() => undefined);
}

async function assertCentre(userId: string, daycareId: string) {
  const sql = await getSql();
  const ids = await listAccessibleDaycareIds(sql, userId);
  if (!ids.includes(daycareId)) fail("centre");
}

function toEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    staffName: row.staff_name,
    clockIn: new Date(row.clock_in_at).toISOString(),
    clockOut: row.clock_out_at ? new Date(row.clock_out_at).toISOString() : null,
  };
}

export const timesheetStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: staffTimesheetsEnabled() }));

export const listTimesheets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; weekOf?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    weekOf: String(input?.weekOf || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!staffTimesheetsEnabled()) {
      return {
        enabled: false as const,
        centres: [],
        daycareId: "",
        weekLabel: "",
        open: [],
        week: [],
        totals: [],
        edits: [],
      };
    }
    const sql = await getSql();
    await ensureTimesheetTables();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.length) {
      return { enabled: true as const, centres: [], daycareId: "", weekLabel: "", open: [], week: [], totals: [], edits: [] };
    }
    const centres = await sql.query<{ id: string; name: string }>(
      `select id, name from daycares where id = any($1::text[]) order by name`,
      [ids],
    ).catch(() => []);
    const daycareId = centres.some((row) => row.id === data.daycareId) ? data.daycareId : centres[0]?.id || "";
    const anchor = data.weekOf && !Number.isNaN(Date.parse(data.weekOf)) ? new Date(data.weekOf) : new Date();
    const week = torontoWeek(anchor);
    if (!daycareId) {
      return { enabled: true as const, centres, daycareId: "", weekLabel: week.label, open: [], week: [], totals: [], edits: [] };
    }
    const rows = await sql<EntryRow>`
      select id, staff_name, clock_in_at, clock_out_at
      from staff_time_entries
      where daycare_id = ${daycareId}
        and (
          clock_out_at is null
          or (clock_in_at >= ${week.startIso} and clock_in_at < ${week.endIso})
        )
      order by clock_in_at desc
      limit 200
    `.catch(() => []);
    const entries = rows.map(toEntry);
    const open = entries.filter((entry) => !entry.clockOut);
    const inWeek = entries.filter((entry) => {
      const start = Date.parse(entry.clockIn);
      return start >= week.startMs && start < week.endMs;
    });
    const edits = await sql<EditRow>`
      select e.id, e.entry_id, e.field_name, e.before_value, e.after_value, e.note, e.created_at, u.name as actor_name
      from staff_time_edits e
      left join "user" u on u.id = e.actor_id
      where e.daycare_id = ${daycareId}
      order by e.created_at desc
      limit 400
    `.catch(() => []);
    return {
      enabled: true as const,
      centres: centres.map((row) => ({ id: row.id, name: row.name })),
      daycareId,
      weekLabel: week.label,
      open,
      week: inWeek,
      totals: weeklyTotals(inWeek, week),
      edits: edits.map((row) => ({
        id: row.id,
        entryId: row.entry_id,
        field: row.field_name,
        before: row.before_value,
        after: row.after_value,
        note: row.note,
        at: new Date(row.created_at).toISOString(),
        actorName: (row.actor_name || "").trim(),
      })),
    };
  });

export const clockInTimesheet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; staffName?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    staffName: String(input?.staffName || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!staffTimesheetsEnabled()) fail("off");
    await assertCentre(context.userId, data.daycareId);
    await ensureTimesheetTables();
    const sql = await getSql();
    const open = await sql<{ staff_name: string }>`
      select staff_name from staff_time_entries
      where daycare_id = ${data.daycareId} and clock_out_at is null
    `.catch(() => []);
    const planned = planClockIn({ staffName: data.staffName, at: new Date(), openNames: open.map((row) => row.staff_name) });
    if (!planned.ok) fail(planned.error);
    const id = nid("tim");
    await sql`
      insert into staff_time_entries (id, daycare_id, staff_name, clock_in_at, created_by)
      values (${id}, ${data.daycareId}, ${planned.staffName}, ${planned.clockIn}, ${context.userId})
    `;
    await sql`
      insert into staff_time_edits (id, entry_id, daycare_id, actor_id, field_name, before_value, after_value, note)
      values (${nid("ted")}, ${id}, ${data.daycareId}, ${context.userId}, ${"clock_in"}, ${""}, ${planned.clockIn}, ${""})
    `;
    return { ok: true as const, id };
  });

export const clockOutTimesheet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; entryId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    entryId: String(input?.entryId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!staffTimesheetsEnabled()) fail("off");
    await assertCentre(context.userId, data.daycareId);
    const sql = await getSql();
    const rows = await sql<EntryRow>`
      select id, staff_name, clock_in_at, clock_out_at
      from staff_time_entries
      where id = ${data.entryId} and daycare_id = ${data.daycareId}
      limit 1
    `;
    if (!rows[0]) fail("missing");
    const planned = planClockOut(toEntry(rows[0]), new Date());
    if (!planned.ok) fail(planned.error);
    await sql`
      update staff_time_entries
      set clock_out_at = ${planned.clockOut}
      where id = ${data.entryId} and daycare_id = ${data.daycareId} and clock_out_at is null
    `;
    await sql`
      insert into staff_time_edits (id, entry_id, daycare_id, actor_id, field_name, before_value, after_value, note)
      values (
        ${nid("ted")}, ${data.entryId}, ${data.daycareId}, ${context.userId},
        ${planned.change.field}, ${planned.change.before}, ${planned.change.after}, ${""}
      )
    `;
    return { ok: true as const, hours: planned.hours };
  });

export const editTimesheet = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    daycareId?: string;
    entryId?: string;
    staffName?: string;
    clockIn?: string;
    clockOut?: string;
    note?: string;
  } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    entryId: String(input?.entryId || "").trim(),
    staffName: input?.staffName,
    clockIn: input?.clockIn,
    clockOut: input?.clockOut,
    note: input?.note,
  }))
  .handler(async ({ context, data }) => {
    if (!staffTimesheetsEnabled()) fail("off");
    await assertCentre(context.userId, data.daycareId);
    const sql = await getSql();
    const rows = await sql<EntryRow>`
      select id, staff_name, clock_in_at, clock_out_at
      from staff_time_entries
      where id = ${data.entryId} and daycare_id = ${data.daycareId}
      limit 1
    `;
    if (!rows[0]) fail("missing");
    const planned = planTimesheetEdit({
      entry: toEntry(rows[0]),
      staffName: data.staffName,
      clockIn: data.clockIn,
      clockOut: data.clockOut,
      note: data.note,
    });
    if (!planned.ok) fail(planned.error);
    await sql`
      update staff_time_entries
      set staff_name = ${planned.next.staffName},
          clock_in_at = ${planned.next.clockIn},
          clock_out_at = ${planned.next.clockOut}
      where id = ${data.entryId} and daycare_id = ${data.daycareId}
    `;
    for (const change of planned.changes) {
      await sql`
        insert into staff_time_edits (id, entry_id, daycare_id, actor_id, field_name, before_value, after_value, note)
        values (
          ${nid("ted")}, ${data.entryId}, ${data.daycareId}, ${context.userId},
          ${change.field}, ${change.before}, ${change.after}, ${planned.note}
        )
      `;
    }
    return { ok: true as const };
  });

export const exportTimesheetCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; weekOf?: string; locale?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    weekOf: String(input?.weekOf || "").trim(),
    locale: input?.locale === "fr" ? ("fr" as const) : ("en" as const),
  }))
  .handler(async ({ context, data }) => {
    if (!staffTimesheetsEnabled()) fail("off");
    await assertCentre(context.userId, data.daycareId);
    const sql = await getSql();
    const anchor = data.weekOf && !Number.isNaN(Date.parse(data.weekOf)) ? new Date(data.weekOf) : new Date();
    const week = torontoWeek(anchor);
    const rows = await sql<EntryRow>`
      select id, staff_name, clock_in_at, clock_out_at
      from staff_time_entries
      where daycare_id = ${data.daycareId}
        and clock_in_at >= ${week.startIso}
        and clock_in_at < ${week.endIso}
      order by staff_name, clock_in_at
    `.catch(() => []);
    const entries = rows.map(toEntry);
    const csv = timesheetCsv({ entries, totals: weeklyTotals(entries, week), locale: data.locale });
    return { ok: true as const, csv, filename: `kidease-hours-${week.label.slice(0, 10)}.csv` };
  });
