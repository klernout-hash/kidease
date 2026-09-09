/**
 * Parent shortlist (saved centres) + compare helpers.
 * Persistence is Neon `saved_daycares`. This module holds guest intent,
 * a client cache of saved ids, and compare field formatters.
 */

import { amenityLabel } from "@/lib/amenities";
import { LANGUAGES } from "@/lib/languages";
import { isClaimVerified } from "@/lib/trust";
import { formatAgeRange } from "@/lib/utils";

export const PENDING_SAVE_KEY = "kidease-pending-save";
export const SHORTLIST_EVENT = "kidease-shortlist";
export const MAX_SHORTLIST_COMPARE = 5;

const CULTURE_AMENITIES = [
  "inclusive",
  "bilingual",
  "french",
  "montessori",
  "nature",
  "community",
  "ymca",
  "literacy",
  "documentation",
] as const;

const LANG_NAMES: Record<string, { en: string; fr: string }> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, { en: l.nameEn, fr: l.native }]),
);

let cachedIds: Set<string> | null = null;
let cachedUserId: string | null = null;

export type ShortlistListing = {
  id: string;
  languages?: string | null;
  amenities?: string | null;
  agesKnown?: boolean;
  ageMinMonths: number;
  ageMaxMonths: number;
  hours?: string | null;
  hoursFr?: string | null;
  availabilityKnown?: boolean;
  spotsTotal?: number;
  spotsInfant?: number;
  spotsToddler?: number;
  spotsPreschool?: number;
  verified?: boolean;
  claimStatus?: string | null;
  claimed?: boolean;
  claimedAt?: string | null;
  live?: boolean;
  licenseStatus?: string | null;
  registryMatchState?: string | null;
};

export function isValidDaycareId(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const id = raw.trim();
  return id.length >= 2 && id.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function stashPendingSave(daycareId: string) {
  if (typeof window === "undefined" || !isValidDaycareId(daycareId)) return;
  try {
    window.sessionStorage.setItem(PENDING_SAVE_KEY, daycareId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekPendingSave(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_SAVE_KEY);
    return isValidDaycareId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function takePendingSave(): string | null {
  const id = peekPendingSave();
  if (typeof window === "undefined") return id;
  try {
    window.sessionStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    /* ignore */
  }
  return id;
}

export function readShortlistCache(userId?: string | null): Set<string> | null {
  if (!cachedIds) return null;
  if (userId && cachedUserId && cachedUserId !== userId) return null;
  return new Set(cachedIds);
}

export function writeShortlistCache(ids: string[], userId?: string | null) {
  cachedIds = new Set(ids.filter(isValidDaycareId));
  if (userId) cachedUserId = userId;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SHORTLIST_EVENT));
  }
}

export function markShortlistCache(id: string, saved: boolean, userId?: string | null) {
  if (userId && cachedUserId && cachedUserId !== userId) {
    cachedIds = new Set();
    cachedUserId = userId;
  }
  if (!cachedIds) cachedIds = new Set();
  if (userId) cachedUserId = userId;
  if (saved) cachedIds.add(id);
  else cachedIds.delete(id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SHORTLIST_EVENT));
  }
}

export function clearShortlistCache() {
  cachedIds = null;
  cachedUserId = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SHORTLIST_EVENT));
  }
}

export function toggleCompareSelection(selected: string[], id: string, max = MAX_SHORTLIST_COMPARE): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length >= max) return selected;
  return [...selected, id];
}

function amenityKeys(raw: string | null | undefined) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatListingLanguages(raw: string | null | undefined, locale: "en" | "fr") {
  const parts = amenityKeys(raw);
  if (!parts.length) return "";
  return parts
    .map((code) => {
      const key = code.toLowerCase();
      const named = LANG_NAMES[key];
      if (named) return locale === "fr" ? named.fr : named.en;
      if (key === "english") return locale === "fr" ? "Anglais" : "English";
      if (key === "french" || key === "français" || key === "francais") return locale === "fr" ? "Français" : "French";
      return code;
    })
    .join(", ");
}

export function formatListingCulture(raw: string | null | undefined, locale: "en" | "fr") {
  const keys = amenityKeys(raw).filter((k) => (CULTURE_AMENITIES as readonly string[]).includes(k));
  if (!keys.length) return "";
  return keys.map((k) => amenityLabel(k, locale)).join(" · ");
}

export function formatListingAges(item: Pick<ShortlistListing, "agesKnown" | "ageMinMonths" | "ageMaxMonths">) {
  if (item.agesKnown === false) return "";
  if (!(item.ageMaxMonths > item.ageMinMonths) && item.ageMinMonths <= 0) return "";
  return formatAgeRange(item.ageMinMonths, item.ageMaxMonths);
}

export function listingSpotsTotal(item: Pick<ShortlistListing, "spotsTotal" | "spotsInfant" | "spotsToddler" | "spotsPreschool">) {
  if (typeof item.spotsTotal === "number") return item.spotsTotal;
  return (item.spotsInfant ?? 0) + (item.spotsToddler ?? 0) + (item.spotsPreschool ?? 0);
}

export function listingIsVerified(item: ShortlistListing) {
  if (item.verified) return true;
  if (item.licenseStatus === "matched" || item.registryMatchState === "matched") return true;
  return isClaimVerified({
    claimStatus: item.claimStatus,
    claimed: item.claimed,
    claimedAt: item.claimedAt,
    live: item.live,
  });
}
