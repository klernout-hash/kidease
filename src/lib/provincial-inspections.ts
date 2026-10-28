/**
 * Official provincial registry links. No scraped violation text.
 * Unclaimed cards stay on the licence number and this portal link.
 */

import { jurisdiction, type Jurisdiction } from "./province-registry.ts";
import { licenseRecordUrl, officialLicenceNumber } from "./licensing.ts";

export const INSPECTION_PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;

export type InspectionLink = {
  code: string;
  url: string;
  labelEn: string;
  labelFr: string;
};

export function inspectionPortal(province: string, name?: string, locale?: "en" | "fr"): InspectionLink | null {
  const row: Jurisdiction | undefined = jurisdiction(province);
  if (!row?.registryUrl) return null;
  const url = licenseRecordUrl(row.code, name, null, locale) || row.registryUrl;
  return {
    code: row.code,
    url,
    labelEn: `View official ${row.nameEn} inspection record`,
    labelFr: `Voir le dossier officiel d'inspection (${row.nameFr})`,
  };
}

export type LicenceStanding = "active" | "unknown";

export function licenceStanding(status?: string | null): LicenceStanding {
  const value = (status || "").trim().toLowerCase();
  if (value === "active" || value === "matched") return "active";
  return "unknown";
}

export function publicLicenceLine(raw?: string | null, id?: string | null): string | null {
  return officialLicenceNumber(raw, id);
}

export type ChecklistItem = { id: string; ok: boolean };

/** Positive checklist for a claimed centre or an admin. Never a violation list. */
export function inspectionChecklistBadge(items: ChecklistItem[] | null | undefined, claimed: boolean): { show: boolean; passed: number; total: number } {
  if (!claimed || !items?.length) return { show: false, passed: 0, total: 0 };
  const total = items.length;
  const passed = items.filter((item) => item.ok).length;
  return { show: true, passed, total };
}
