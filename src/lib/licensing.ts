/** Official provincial / territorial licence lookup and subsidy pages. */

import type { Locale } from "./types.ts";
import { canadaFallbackUrl, jurisdiction } from "./province-registry.ts";

/** Jurisdictions where $10-a-day / reduced parent fees are typical at licensed 0–5 centres. Confirm with the centre. */
const TYPICAL_TEN = new Set(["MB", "SK", "PE", "NL", "YT", "NT", "NU"]);

/** Official registry search page. Null when this province has no page we can stand behind. */
export function licenseRegistryUrl(province: string): string | null {
  return jurisdiction(province)?.registryUrl ?? null;
}

/**
 * French pages checked against the live site. Other provinces stay on the English search page.
 */
const FR_REGISTRY: Partial<Record<string, string>> = {
  MB: "https://childcaresearch.gov.mb.ca/fr",
  ON: "https://www.earlyyears.edu.gov.on.ca/LCCWWeb/childcare/search.xhtml?lang=fr",
  QC: "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde",
  NB: "https://www.nbed.nb.ca/parentportal/fr/Search/Info/",
  NU: "https://www.gov.nu.ca/fr/education-et-ecoles/centres-de-la-petite-enfance-titulaires-dun-permis",
};

/**
 * Hosts that actually search on this query key.
 * A generic `q` is not used: alberta.ca, gov.bc.ca, ontario.ca, and ece.gov.nt.ca
 * answer it with a 404 or a junk path such as /en/test.
 */
const NAME_QUERY: Partial<Record<string, string>> = {
  AB: "name",
  NL: "keyword",
};

/**
 * Official provincial or territorial registry record or search page.
 * Null when there is no working page, so the link can be hidden.
 * The centre name is added only where that host searches on it.
 * The stored licence number is not appended: it is not a search key on these sites,
 * and the old `?q=name licence` URLs were the error pages.
 */
export function licenseRecordUrl(
  province: string,
  name?: string,
  _licenseNumber?: string | null,
  locale?: Locale,
): string | null {
  const row = jurisdiction(province);
  if (!row?.registryUrl) return null;
  const base = (locale === "fr" && FR_REGISTRY[row.code]) || row.registryUrl;
  const param = NAME_QUERY[row.code];
  const q = (name || "").replace(/\s+/g, " ").trim();
  if (!param || !q) return base;
  const url = new URL(base);
  url.searchParams.set(param, q);
  return url.toString();
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
  // Catalogue keys such as MB|home-… are not a provincial licence number.
  if (n.includes("|")) return null;
  if (id && n.toLowerCase() === id.toLowerCase()) return null;
  if (/^d_[a-z0-9]{6,}$/i.test(n)) return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}
