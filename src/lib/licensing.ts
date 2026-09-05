/** Official provincial / territorial licence lookup and subsidy pages. */

import type { Locale } from "@/lib/types";
import { canadaFallbackUrl, jurisdiction } from "@/lib/province-registry";

/** Jurisdictions where $10-a-day / reduced parent fees are typical at licensed 0–5 centres. Confirm with the centre. */
const TYPICAL_TEN = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU"]);

export function licenseRegistryUrl(province: string) {
  return jurisdiction(province)?.registryUrl ?? canadaFallbackUrl();
}

/** Official registry, with a search query so parents land closer to this centre. */
export function licenseRecordUrl(province: string, name?: string, licenseNumber?: string | null) {
  const base = licenseRegistryUrl(province);
  const q = [name, licenseNumber].filter(Boolean).join(" ").trim();
  if (!q) return base;
  if (province === "MB") {
    return `https://childcaresearch.gov.mb.ca/en#q=${encodeURIComponent(q)}`;
  }
  return `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`;
}

export function subsidyEstimatorUrl(province: string) {
  return jurisdiction(province)?.subsidyUrl ?? canadaFallbackUrl();
}

export type CwelccKind = "typical" | "ask" | "qc" | "ab";

export function cwelccKind(province: string): CwelccKind {
  if (province === "QC") return "qc";
  if (province === "AB") return "ab";
  if (TYPICAL_TEN.has(province)) return "typical";
  return "ask";
}

/**
 * Fee-program badge only where that program actually runs.
 * MB SK PE NL YT NT NU → $10-a-day
 * QC → reduced Québec rate
 * AB → $15-a-day
 * ON BC NS NB and anywhere else → no $10 badge.
 */
export function feeProgramBadgeKey(
  province: string,
): "badgeTen" | "badgeFifteen" | "badgeReducedQc" | null {
  const kind = cwelccKind(province);
  if (kind === "typical") return "badgeTen";
  if (kind === "qc") return "badgeReducedQc";
  if (kind === "ab") return "badgeFifteen";
  return null;
}

/** @deprecated Prefer feeProgramBadgeKey so provinces without a $10 program stay unlabeled. */
export function feeBadgeKey(province: string): "badgeTen" | "badgeFifteen" | "badgeReducedQc" | "badgeTenAsk" {
  return feeProgramBadgeKey(province) ?? "badgeTenAsk";
}

export function pinFeeLabel(
  province: string,
  live: boolean,
  fromPrice: number,
  locale: Locale,
  moneyFn: (n: number, locale: Locale) => string,
) {
  if (live && fromPrice > 0) return moneyFn(fromPrice, locale);
  if (cwelccKind(province) === "qc") return "$9.65";
  if (cwelccKind(province) === "ab") return "$15";
  if (cwelccKind(province) === "typical") return "$10";
  return "—";
}

export function hasAmenity(amenities: string, key: string) {
  return amenities
    .split(",")
    .map((s) => s.trim())
    .includes(key);
}

export function opensEarly(hours: string) {
  return /6:\d|7:00|6 a/i.test(hours);
}

export function staysLate(hours: string, amenities: string) {
  return hasAmenity(amenities, "extended") || hasAmenity(amenities, "evenings") || /18:|19:|6 p\.?m|7 p\.?m/i.test(hours);
}

/**
 * Hide sequential source IDs (bc-1 → "1") so cards only show a real provincial licence #.
 * Ontario numbers are 4–7 digits or P-codes; those stay visible.
 */
export function officialLicenceNumber(raw?: string | null, id?: string | null): string | null {
  const n = (raw || "").trim();
  if (!n || n === "—" || n.toLowerCase() === "unknown") return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}
