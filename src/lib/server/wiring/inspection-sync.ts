import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { getSql } from "@/lib/db";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { assertGovWritable, type GovActor } from "@/lib/server/gov-actor.server";
import { acceptInspection, inspectionProvinceOk, inspectionSummary, inspectionSyncEnabled } from "@/lib/wiring/inspection-sync";
import { newId } from "@/lib/server/wiring/runtime";
import type { PublicInspection } from "@/lib/inspection-history";

export const publishInspection = createServerFn({ method: "POST" })
  .middleware([govAuthMiddleware])
  .validator((input: { record?: unknown }) => ({ record: input?.record }))
  .handler(async ({ context, data }) => {
    if (!inspectionSyncEnabled()) return { ok: false as const, error: "off" };
    const gov = context.gov as GovActor;
    const accepted = acceptInspection(data.record);
    if ("error" in accepted) return { ok: false as const, error: accepted.error };
    if (!inspectionProvinceOk(gov.province, accepted.province)) return { ok: false as const, error: "province" };
    try {
      assertGovWritable(gov);
    } catch {
      return { ok: false as const, error: "read_only" };
    }
    const sql = await getSql();
    await sql`
      insert into listing_inspections (id, province, licence_number, inspected_on, outcome, summary, source_url)
      values (
        ${newId("ins")}, ${accepted.province}, ${accepted.licenceNumber}, ${accepted.inspectedOn},
        ${accepted.outcome}, ${accepted.summary}, ${accepted.sourceUrl}
      )
      on conflict (province, licence_number, inspected_on, source_url) do nothing
    `;
    await sql`
      insert into inspection_sync_log (id, province, licence_number, inspected_on, actor_id)
      values (${newId("isl")}, ${accepted.province}, ${accepted.licenceNumber}, ${accepted.inspectedOn}, ${gov.userId})
    `.catch(() => undefined);
    return { ok: true as const, summary: inspectionSummary([accepted]) };
  });

export async function inspectionSummaryForLicence(province: string, licenceNumber: string): Promise<ReturnType<typeof inspectionSummary>> {
  if (!inspectionSyncEnabled()) return null;
  const sql = await getSql();
  const rows = await sql<{ inspected_on: string | Date; outcome: string; summary: string; source_url: string }>`
    select inspected_on, outcome, summary, source_url
    from listing_inspections
    where province = ${province.trim().toUpperCase()} and licence_number = ${licenceNumber.trim()}
    order by inspected_on desc
    limit 12
  `.catch(() => []);
  const publicRows: PublicInspection[] = rows.map((row) => ({
    inspectedOn: String(row.inspected_on).slice(0, 10),
    outcome: row.outcome,
    summary: row.summary,
    sourceUrl: row.source_url,
  }));
  return inspectionSummary(publicRows);
}

export const centreInspectionSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!inspectionSyncEnabled()) return { enabled: false as const, summary: null };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(data.daycareId)) return { enabled: true as const, summary: null };
    const centre = await sql<{ province: string; license_number: string | null }>`
      select province, license_number from daycares where id = ${data.daycareId} limit 1
    `;
    if (!centre[0]?.license_number) return { enabled: true as const, summary: null };
    const summary = await inspectionSummaryForLicence(centre[0].province, centre[0].license_number);
    return { enabled: true as const, summary };
  });

export const publicInspectionSync = createServerFn({ method: "GET" })
  .validator((input: { province?: string; licence?: string }) => ({
    province: String(input?.province || "").slice(0, 8),
    licence: String(input?.licence || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const summary = await inspectionSummaryForLicence(data.province, data.licence);
    return { summary };
  });
