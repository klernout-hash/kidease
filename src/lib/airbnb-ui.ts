/**
 * Airbnb-style phone shell helpers. Pure: no React, no network, no Google.
 * FEATURE_UI_AIRBNB_V1 stays off until Kyle turns it on. Flag off renders none of this.
 */

import { isHomeDaycare, publicHomePlace } from "./home-address-privacy.ts";

export const AIRBNB_UI_FLAG = "FEATURE_UI_AIRBNB_V1";

export const AIRBNB_CHIPS = [
  { id: "open", search: { openings: "1" } },
  { id: "home", search: { fac: "family_home" } },
  { id: "infant", search: { age: "infant" } },
  { id: "subsidy", search: { subsidy: "1" } },
] as const;

export type AirbnbChipId = (typeof AIRBNB_CHIPS)[number]["id"];

export type AirbnbAccountRowId =
  | "personal"
  | "security"
  | "privacy"
  | "notifications"
  | "language"
  | "payments"
  | "accessibility"
  | "legal"
  | "sign-out";

/** Hub rows. Payments is receipts only. No subscribe, upgrade, or pay button. */
export function airbnbAccountRows(signedIn: boolean): AirbnbAccountRowId[] {
  const rows: AirbnbAccountRowId[] = [
    "personal",
    "security",
    "privacy",
    "notifications",
    "language",
    "accessibility",
    "legal",
  ];
  if (signedIn) rows.splice(5, 0, "payments");
  if (signedIn) rows.push("sign-out");
  return rows;
}

export function maskEmail(email: string): string {
  const value = email.trim();
  const at = value.indexOf("@");
  if (at < 1) return "";
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain) return "";
  const head = name.slice(0, 1);
  const tail = name.length > 1 ? name.slice(-1) : "";
  return `${head}•••${tail}@${domain}`;
}

/** Last four digits only. Example: +1 ***-***-1916. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `+1 ***-***-${digits.slice(-4)}`;
}

export type AirbnbPlaceInput = {
  city?: string | null;
  address?: string | null;
  addressPlace?: string | null;
  addressProtected?: boolean | null;
  facilityType?: string | null;
  amenities?: string | null;
  showPublicAddress?: boolean | null;
  postalCode?: string | null;
  neighbourhood?: string | null;
};

/**
 * City-level line for a card. A home daycare never contributes its street.
 * The address field is ignored on purpose.
 */
export function airbnbPublicPlace(row: AirbnbPlaceInput): string {
  const home = isHomeDaycare(row) || row.addressProtected === true;
  if (home && row.showPublicAddress !== true) {
    const place =
      (row.addressPlace || "").trim() ||
      publicHomePlace({
        city: row.city,
        neighbourhood: row.neighbourhood,
        postalCode: row.postalCode,
      });
    return place || (row.city || "").trim();
  }
  return (row.city || "").trim();
}

export function freshnessLine(iso: string | null | undefined, locale = "en", now = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const days = Math.max(0, Math.round((now - then) / 86_400_000));
  const fr = locale === "fr";
  if (days <= 0) return fr ? "Mis à jour aujourd’hui" : "Updated today";
  if (days === 1) return fr ? "Mis à jour hier" : "Updated yesterday";
  return fr ? `Mis à jour il y a ${days} jours` : `Updated ${days} days ago`;
}

export function ageRangeLabel(minMonths: number, maxMonths: number, locale = "en"): string {
  if (!Number.isFinite(minMonths) || !Number.isFinite(maxMonths) || maxMonths <= 0) return "";
  const min = Math.max(0, Math.round(minMonths / 12));
  const max = Math.max(min, Math.round(maxMonths / 12));
  return locale === "fr" ? `${min}–${max} ans` : `${min}–${max} yrs`;
}

const KNOWN_KEY = "kidease-airbnb-known-langs";

export function readKnownLanguages(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KNOWN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string").slice(0, 12);
  } catch {
    return [];
  }
}

export function writeKnownLanguages(codes: readonly string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KNOWN_KEY, JSON.stringify([...new Set(codes)].slice(0, 12)));
  } catch {
    /* private mode */
  }
}
