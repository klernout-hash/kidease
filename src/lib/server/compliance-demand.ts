import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { demandDelivery, demandMode, demandReport, quarterKey, quarterReportDue, type DemandReportData } from "@/lib/compliance/demand";
import type { PackMode } from "@/lib/compliance/mode";
import { logPractice, readScope, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

async function cells(province: string) {
  const sql = await sqlClient();
  const rows = await sql<{ province: string; city: string; age_group: string; n: number }>`
    select d.province, d.city, w.age_group, count(*)::int as n
    from daycare_waitlist w
    join daycares d on d.id = w.daycare_id
    where w.status = 'waiting' and upper(btrim(d.province)) = ${province.trim().toUpperCase()}
    group by d.province, d.city, w.age_group
  `;
  if (!Array.isArray(rows)) throw new Error("Demand report could not be loaded");
  return rows.map((row) => ({
    province: row.province,
    area: (row.city || "").trim() || "area",
    ageKey: row.age_group,
    n: Number(row.n) || 0,
  }));
}

/** Authentication and scope resolution stay outside this data-read boundary. */
async function readDemandReport(mode: PackMode, province: string, today: string): Promise<DemandReportData> {
  const context = { mode, province, quarter: quarterKey(today) };
  if (mode === "off") return { ...context, enabled: false, status: "off", rows: [] };
  try {
    const report = demandReport(await cells(province), province);
    return { ...context, enabled: true, status: "ready", rows: report.rows };
  } catch {
    return { ...context, enabled: true, status: "unavailable" };
  }
}

export const loadGovDemand = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = demandMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    const today = new Date().toISOString().slice(0, 10);
    return readDemandReport(mode, province, today);
  });

export const loadAdminDemand = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = demandMode(process.env);
    const today = new Date().toISOString().slice(0, 10);
    return readDemandReport(mode, data.province, today);
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
