import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { fundingMode, fundingReport, submissionPlan } from "@/lib/compliance/funding";
import { centreRow, logPractice, ownedCentreIds, readScope, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

async function linesFor(daycareId: string, period: string) {
  const sql = await sqlClient();
  const enrolled = await sql<{ age_group: string; n: number }>`
    select age_group, count(*)::int as n
    from bookings
    where daycare_id = ${daycareId}
      and status in ('confirmed', 'active', 'enrolled', 'accepted')
    group by age_group
  `.catch(() => []);
  const days = await sql<{ n: number }>`
    select count(*)::int as n from attendance
    where daycare_id = ${daycareId}
      and to_char(day, 'YYYY-MM') = ${period}
  `.catch(() => []);
  const attended = Number(days[0]?.n || 0);
  const ages = enrolled.length ? enrolled : [{ age_group: "all", n: 0 }];
  return ages.map((row, index) => ({
    ageKey: row.age_group,
    enrolled: Number(row.n) || 0,
    attendedDays: index === 0 ? attended : 0,
  }));
}

export const loadCentreFunding = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = fundingMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, centres: [], report: null };
    const ids = await ownedCentreIds(context.userId);
    const sql = await sqlClient();
    const centres = ids.length
      ? await sql.query<{ id: string; name: string; province: string }>(
          `select id, name, province from daycares where id = any($1::text[]) order by name`, [ids]).catch(() => [])
      : [];
    return { enabled: true as const, mode, centres, report: null };
  });

export const buildFundingReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; period?: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = fundingMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const daycareId = String(data.daycareId || "").trim();
    const ids = await ownedCentreIds(context.userId);
    if (!ids.includes(daycareId)) return { ok: false as const, reason: "centre" };
    const period = String(data.period || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false as const, reason: "period" };
    const sql = await sqlClient();
    const centre = await centreRow(sql, daycareId);
    if (!centre) return { ok: false as const, reason: "centre" };
    const report = fundingReport({ province: centre.province, period, lines: await linesFor(daycareId, period) });
    const plan = submissionPlan(mode, report.blocked);
    const id = nid("fun");
    await sql`
      insert into funding_reports (id, daycare_id, province, period, blocked, verified, payload, created_by)
      values (${id}, ${daycareId}, ${centre.province}, ${period}, ${report.blocked ? 1 : 0}, ${report.verified ? 1 : 0}, ${JSON.stringify({ rows: report.rows.map((row) => ({ ageKey: row.ageKey, enrolled: row.enrolled, attendedDays: row.attendedDays, flags: row.flags })) })}::jsonb, ${context.userId})
    `;
    logPractice("FEATURE_FUNDING_REPORTS", { action: "report", id, province: centre.province, period, plan, mode });
    return { ok: true as const, id, report, plan };
  });

async function govSummary(province: string) {
  const sql = await sqlClient();
  const rows = await sql<{ blocked: number; n: number }>`
    select blocked, count(*)::int as n from funding_reports
    where province = ${province}
    group by blocked
  `.catch(() => []);
  return rows.map((row) => ({ blocked: Number(row.blocked) === 1, count: Number(row.n) || 0 }));
}

export const loadGovFunding = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = fundingMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, rows: [] };
    return { enabled: true as const, mode, province, rows: await govSummary(province) };
  });

export const loadAdminFunding = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = fundingMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, rows: [] };
    return { enabled: true as const, mode, province: data.province, rows: await govSummary(data.province) };
  });

export async function runFundingJob() {
  const mode = fundingMode(process.env);
  if (mode === "off") return { ok: true, mode, built: 0 };
  logPractice("FEATURE_FUNDING_REPORTS", { action: "monthly", mode });
  return { ok: true, mode, built: 0 };
}
