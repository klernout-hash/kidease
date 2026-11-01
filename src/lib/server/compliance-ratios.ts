import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { directorAlertPlan, monthlyReport, ratioCheck, ratioMode } from "@/lib/compliance/ratios";
import { caslSmsGranted, centreRow, logPractice, ownedCentreIds, readScope, sendComplianceSms, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

export const loadCentreRatios = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = ratioMode(process.env);
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
      ? await sql.query<{ id: string; age_key: string; children: number; staff_count: number; ok: number }>(
          `select id, age_key, children, staff_count, ok from ratio_checks where daycare_id = any($1::text[]) order by checked_at desc limit 40`,
          [ids],
        ).catch(() => [])
      : [];
    return { enabled: true as const, mode, centres, rows };
  });

export const saveRatioCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ageKey?: string; children?: number; staff?: number }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = ratioMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const daycareId = String(data.daycareId || "").trim();
    const ids = await ownedCentreIds(context.userId);
    if (!ids.includes(daycareId)) return { ok: false as const, reason: "centre" };
    const sql = await sqlClient();
    const centre = await centreRow(sql, daycareId);
    if (!centre) return { ok: false as const, reason: "centre" };
    const children = Math.max(0, Math.floor(Number(data.children) || 0));
    const staff = Math.max(0, Math.floor(Number(data.staff) || 0));
    const ageKey = String(data.ageKey || "").slice(0, 40);
    const result = ratioCheck({ province: centre.province, ageKey, children, staffOnShift: staff });
    if (!result.known) return { ok: false as const, reason: "age" };
    const plan = directorAlertPlan(mode, !result.ok, false);
    const id = nid("rat");
    await sql`
      insert into ratio_checks (id, daycare_id, province, age_key, children, staff_count, ok, verified, created_by)
      values (${id}, ${daycareId}, ${centre.province}, ${ageKey}, ${children}, ${staff}, ${result.ok ? 1 : 0}, ${result.verified ? 1 : 0}, ${context.userId})
    `;
    logPractice("FEATURE_RATIO_MONITOR", { action: "check", id, province: centre.province, ageKey, ok: result.ok, alert: plan.inApp, mode });
    if (plan.sms === "send") {
      const casl = await caslSmsGranted(context.userId);
      const sms = directorAlertPlan(mode, true, casl);
      if (sms.sms === "send") {
        const phone = await sql<{ phone: string | null }>`select phone from profiles where user_id = ${context.userId} limit 1`.catch(() => []);
        if (phone[0]?.phone) {
          await sendComplianceSms({
            to: phone[0].phone,
            body: "KidEase: a room is over ratio. Open your daycare desk. Reply STOP to opt out.",
            consentGranted: true,
          });
        }
      }
    }
    return { ok: true as const, id, result, alert: plan.inApp };
  });

async function monthCounts(province: string) {
  const sql = await sqlClient();
  const rows = await sql<{ age_key: string; n: number }>`
    select age_key, count(*)::int as n
    from ratio_checks
    where province = ${province} and ok = 0 and checked_at > now() - interval '31 days'
    group by age_key
  `.catch(() => []);
  return monthlyReport(rows.map((row) => ({ province, ageKey: row.age_key, breaches: Number(row.n) || 0 })), province);
}

export const loadGovRatios = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = ratioMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, rows: [] };
    return { enabled: true as const, mode, province, rows: await monthCounts(province) };
  });

export const loadAdminRatios = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = ratioMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, rows: [] };
    return { enabled: true as const, mode, province: data.province, rows: await monthCounts(data.province) };
  });

export async function runRatioJob() {
  const mode = ratioMode(process.env);
  if (mode === "off") return { ok: true, mode, checked: 0 };
  logPractice("FEATURE_RATIO_MONITOR", { action: "monthly", mode });
  return { ok: true, mode, checked: 0 };
}
