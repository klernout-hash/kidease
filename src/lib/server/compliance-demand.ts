import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { demandDelivery, demandMode, demandReport, normalizeFsa, quarterKey, quarterReportDue } from "@/lib/compliance/demand";
import { logPractice, readScope, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

async function cells(province: string) {
  const sql = await sqlClient();
  const rows = await sql<{ province: string; postal_code: string; city: string; age_group: string; n: number }>`
    select d.province, d.postal_code, d.city, w.age_group, count(*)::int as n
    from daycare_waitlist w
    join daycares d on d.id = w.daycare_id
    where w.status = 'waiting' and d.province = ${province}
    group by d.province, d.postal_code, d.city, w.age_group
  `.catch(() => []);
  return rows.map((row) => ({
    province: row.province,
    area: normalizeFsa(row.postal_code || "") || row.city || "area",
    ageKey: row.age_group,
    n: Number(row.n) || 0,
  }));
}

export const loadGovDemand = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = demandMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    const today = new Date().toISOString().slice(0, 10);
    if (mode === "off") return { enabled: false as const, mode, province, quarter: quarterKey(today), rows: [] };
    const report = demandReport(await cells(province), province);
    return { enabled: true as const, mode, province, quarter: quarterKey(today), rows: report.rows };
  });

export const loadAdminDemand = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = demandMode(process.env);
    const today = new Date().toISOString().slice(0, 10);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, quarter: quarterKey(today), rows: [] };
    const report = demandReport(await cells(data.province), data.province);
    return { enabled: true as const, mode, province: data.province, quarter: quarterKey(today), rows: report.rows };
  });

export async function runDemandJob(now = new Date()) {
  const mode = demandMode(process.env);
  const day = now.toISOString().slice(0, 10);
  const due = quarterReportDue(day);
  const delivery = demandDelivery(mode, due);
  if (delivery === "skip") return { ok: true, mode, delivery };
  logPractice("FEATURE_DEMAND_REPORTS", { action: "quarter", quarter: quarterKey(day), delivery, mode });
  return { ok: true, mode, delivery, quarter: quarterKey(day) };
}
