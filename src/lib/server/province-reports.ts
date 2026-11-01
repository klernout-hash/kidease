import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { provinceReportsEnabled } from "@/lib/features";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import {
  buildProvinceReport,
  reportProvinceAllowed,
  type ProvinceReportFormat,
  type ProvinceReportRow,
} from "@/lib/province-reports";
import { requireAdmin } from "@/lib/server/roles";
import { nid } from "@/lib/utils";

export const provinceReportsReady = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return { enabled: provinceReportsEnabled() };
  });

export const exportProvinceReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { province?: string; format?: string }) => ({
    province: String(input?.province || "").trim().toUpperCase().slice(0, 2),
    format: input?.format === "pdf" ? "pdf" : "csv",
  }))
  .handler(async ({ context, data }) => {
    if (!provinceReportsEnabled()) return { ok: false as const, reason: "off" as const };
    await requireAdmin(context.userId);
    if (!reportProvinceAllowed({ role: "admin", requested: data.province })) {
      return { ok: false as const, reason: "province" as const };
    }
    const sql = await getSql();
    const rows = await sql
      .query<{
        license_number: string | null;
        name: string | null;
        city: string | null;
        postal_code: string | null;
        province: string | null;
        spots_infant: number | null;
        spots_toddler: number | null;
        spots_preschool: number | null;
      }>(
        `select license_number, name, city, postal_code, province,
                spots_infant, spots_toddler, spots_preschool
           from daycares
          where province = $1
            and ${PUBLIC_LISTING_SQL}
          limit 5000`,
        [data.province],
      )
      .catch(() => []);
    const listed = Array.isArray(rows) ? rows : [];
    const reportRows: ProvinceReportRow[] = listed.map((row) => {
      const parts = [row.spots_infant, row.spots_toddler, row.spots_preschool];
      const known = parts.every((n) => n == null)
        ? null
        : parts.reduce<number>((sum, n) => sum + (Number(n) || 0), 0);
      return {
        licence: row.license_number,
        name: row.name,
        city: row.city,
        postal: row.postal_code,
        province: row.province,
        licensedSpaces: null,
        openSpots: known,
      };
    });
    const built = buildProvinceReport({
      province: data.province,
      rows: reportRows,
      format: data.format as ProvinceReportFormat,
      reportDate: new Date().toISOString().slice(0, 10),
      enabled: true,
    });
    if (!built.ok) return built;
    await sql`
      insert into province_report_exports (id, province, format, row_count, actor_user_id)
      values (${nid("pr")}, ${data.province}, ${data.format}, ${reportRows.length}, ${context.userId})
    `.catch(() => undefined);
    return built;
  });
