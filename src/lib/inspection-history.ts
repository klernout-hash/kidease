/**
 * Cached public inspection rows for Ontario, British Columbia, and Alberta.
 * A row is kept only when it cites a government page. KidEase does not invent one.
 */

export const INSPECTION_HISTORY_PROVINCES = ["ON", "BC", "AB"] as const;
export type InspectionProvince = (typeof INSPECTION_HISTORY_PROVINCES)[number];

export const INSPECTION_SOURCE_PAGES: Record<InspectionProvince, { label: string; page: string }> = {
  ON: {
    label: "Ontario child care licensing",
    page: "https://www.ontario.ca/page/child-care-rules-ontario",
  },
  BC: {
    label: "British Columbia child care licensing",
    page: "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/child-care",
  },
  AB: {
    label: "Alberta child care licensing",
    page: "https://www.alberta.ca/child-care-licensing",
  },
};

const PUBLIC_HOSTS = ["ontario.ca", "gov.bc.ca", "alberta.ca", "open.canada.ca"];

export type InspectionRecord = {
  province: InspectionProvince;
  licenceNumber: string;
  inspectedOn: string;
  outcome: string;
  summary: string;
  sourceUrl: string;
};

export type PublicInspection = {
  inspectedOn: string;
  outcome: string;
  summary: string;
  sourceUrl: string;
};

export function isPublicInspectionUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PUBLIC_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function asProvince(value: unknown): InspectionProvince | null {
  const code = String(value || "").trim().toUpperCase();
  if (code === "ON" || code === "BC" || code === "AB") return code;
  return null;
}

/** Drop anything that is not a dated public record. */
export function parseInspectionCache(raw: unknown): InspectionRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const province = asProvince(row.province);
    const licenceNumber = String(row.licenceNumber || row.licenseNumber || "").trim().slice(0, 80);
    const inspectedOn = String(row.inspectedOn || "").trim().slice(0, 10);
    const outcome = String(row.outcome || "").trim().slice(0, 120);
    const summary = String(row.summary || "").trim().slice(0, 500);
    const sourceUrl = String(row.sourceUrl || "").trim().slice(0, 400);
    if (!province || !licenceNumber || !/^\d{4}-\d{2}-\d{2}$/.test(inspectedOn)) continue;
    if (!outcome || !isPublicInspectionUrl(sourceUrl)) continue;
    out.push({ province, licenceNumber, inspectedOn, outcome, summary, sourceUrl });
  }
  return out;
}
