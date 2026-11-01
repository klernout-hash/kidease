import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import {
  calendarMode,
  isCalendarKind,
  isOverdue,
  overdueForProvince,
  reminderPlan,
} from "@/lib/compliance/calendar";
import { centreRow, logPractice, ownedCentreIds, readScope, sendComplianceEmail, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export const loadCentreCalendar = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = calendarMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, centres: [], rows: [] };
    const ids = await ownedCentreIds(context.userId);
    const sql = await sqlClient();
    const centres = ids.length
      ? await sql.query<{ id: string; name: string; province: string }>(
          `select id, name, province from daycares where id = any($1::text[]) order by name`,
          [ids],
        ).catch(() => [])
      : [];
    const rows = ids.length
      ? await sql.query<{ id: string; daycare_id: string; kind: string; due_on: string; completed_at: string | null }>(
          `select id, daycare_id, kind, due_on::text as due_on, completed_at
           from compliance_dates where daycare_id = any($1::text[])
           order by due_on asc limit 60`,
          [ids],
        ).catch(() => [])
      : [];
    return { enabled: true as const, mode, centres, rows };
  });

export const saveCalendarItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; kind?: string; dueOn?: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = calendarMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const daycareId = String(data.daycareId || "").trim();
    const ids = await ownedCentreIds(context.userId);
    if (!ids.includes(daycareId)) return { ok: false as const, reason: "centre" };
    const kind = String(data.kind || "");
    const dueOn = String(data.dueOn || "").slice(0, 10);
    if (!isCalendarKind(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { ok: false as const, reason: "form" };
    const sql = await sqlClient();
    const centre = await centreRow(sql, daycareId);
    if (!centre) return { ok: false as const, reason: "centre" };
    const id = nid("cal");
    await sql`
      insert into compliance_dates (id, daycare_id, province, kind, due_on, created_by)
      values (${id}, ${daycareId}, ${centre.province}, ${kind}, ${dueOn}, ${context.userId})
    `;
    logPractice("FEATURE_COMPLIANCE_CALENDAR", { action: "saved", id, province: centre.province, kind, mode });
    return { ok: true as const, id };
  });

async function govOverdue(province: string, role: string, govProvince: string | null) {
  const sql = await sqlClient();
  const rows = await sql<{ daycare_id: string; kind: string; due_on: string; province: string }>`
    select daycare_id, kind, due_on::text as due_on, province
    from compliance_dates
    where completed_at is null and province = ${province}
    limit 200
  `.catch(() => []);
  const today = todayIso();
  const flags = overdueForProvince(
    rows.map((row) => ({
      daycareId: row.daycare_id,
      kind: row.kind as "licence_renewal",
      dueOn: String(row.due_on).slice(0, 10),
      province: row.province,
    })),
    { role, govProvince },
    today,
  );
  return { today, overdue: flags.length, rows: flags };
}

export const loadGovCalendar = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = calendarMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, overdue: 0, rows: [] };
    const data = await govOverdue(province, "government", province);
    return { enabled: true as const, mode, province, ...data };
  });

export const loadAdminCalendar = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = calendarMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, overdue: 0, rows: [] };
    const rows = await govOverdue(data.province, "admin", null);
    return { enabled: true as const, mode, province: data.province, ...rows };
  });

export async function runCalendarJob(now = new Date()) {
  const mode = calendarMode(process.env);
  if (mode === "off") return { ok: true, mode, reminded: 0 };
  const sql = await sqlClient();
  const today = todayIso(now);
  const rows = await sql<{
    id: string;
    daycare_id: string;
    kind: string;
    due_on: string;
    completed_at: string | null;
    reminded_day: number | null;
  }>`
    select id, daycare_id, kind, due_on::text as due_on, completed_at, reminded_day
    from compliance_dates
    where completed_at is null
    limit 200
  `.catch(() => []);
  let reminded = 0;
  for (const row of rows) {
    const dueOn = String(row.due_on).slice(0, 10);
    const plan = reminderPlan({
      mode,
      dueOn,
      today,
      completed: Boolean(row.completed_at),
      alreadyRemindedDay: row.reminded_day,
    });
    if (!plan.remind || !plan.day) continue;
    const centre = await centreRow(sql, row.daycare_id);
    logPractice("FEATURE_COMPLIANCE_CALENDAR", {
      action: "remind",
      id: row.id,
      kind: row.kind,
      day: plan.day,
      delivery: plan.delivery,
      overdue: isOverdue(dueOn, today, false),
    });
    if (plan.delivery === "send" && centre?.contact_email) {
      const sent = await sendComplianceEmail({
        to: centre.contact_email,
        subject: "KidEase: a compliance date is coming up",
        text: `A ${row.kind.replaceAll("_", " ")} date is in ${plan.day} days. Open your daycare desk to review it.`,
      });
      if (sent === "sent") {
        await sql`update compliance_dates set reminded_day = ${plan.day} where id = ${row.id}`;
      }
    }
    reminded += 1;
  }
  return { ok: true, mode, reminded };
}
