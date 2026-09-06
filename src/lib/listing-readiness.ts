/**
 * Public listing honesty: vacancy freshness and a soft completeness gate.
 * Never invent open spots or a vacancy time. Incomplete listings stay discoverable.
 * Unknown (no confirm) is not stale — parents should not see “not updated recently”
 * unless a real timestamp is older than two weeks.
 */

import { feeProgramBadgeKey, officialLicenceNumber } from "@/lib/licensing";
import { isClaimVerified, type TrustListing } from "@/lib/trust";
import type { Daycare } from "@/lib/types";

export const COMPLETENESS_FIELDS = ["fees", "ages", "hours", "license", "photo"] as const;
export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

/** Parents should treat vacancy as stale after two weeks without a provider confirm. */
export const VACANCY_STALE_MS = 14 * 24 * 60 * 60 * 1000;

export type RelativeAge = {
  unit: "now" | "minute" | "hour" | "day" | "month";
  count: number;
};

export type VacancyFreshness =
  | { kind: "unknown"; age: null }
  | { kind: "fresh" | "stale"; age: RelativeAge; updatedAt: string };

export type Completeness = {
  ready: boolean;
  score: number;
  missing: CompletenessField[];
  hasFees: boolean;
  hasAges: boolean;
  hasHours: boolean;
  hasLicense: boolean;
  hasPhoto: boolean;
};

/** Official, uploaded, or R2 photos count. Placeholders, logos, and street-view stock do not. */
export function isRealListingPhoto(src?: string | null): boolean {
  const p = (src || "").trim();
  if (!p) return false;
  if (p.includes("placeholder")) return false;
  if (p.includes("-logo")) return false;
  if (p.includes("/photos/wpg/")) return false;
  if (p.startsWith("data:image")) return true;
  if (p.startsWith("/photos/buildings/")) return true;
  if (p.startsWith("/img/")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (p.startsWith("/") && !p.startsWith("/photos/")) return true;
  return false;
}

export function hasListedFees(d: Pick<Daycare, "infantMonthly" | "toddlerMonthly" | "preschoolMonthly" | "partTimeMonthly">) {
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].some(
    (n) => n != null && n > 0,
  );
}

export function hasFeeOrProgram(
  d: Pick<Daycare, "province" | "infantMonthly" | "toddlerMonthly" | "preschoolMonthly" | "partTimeMonthly">,
) {
  return Boolean(feeProgramBadgeKey(d.province)) || hasListedFees(d);
}

export function hasConfirmedAges(d: Pick<Daycare, "agesKnown" | "ageMinMonths" | "ageMaxMonths">) {
  if (d.agesKnown) return true;
  return d.ageMaxMonths > d.ageMinMonths && d.ageMaxMonths > 0;
}

export function hasListedHours(hours?: string | null) {
  const v = (hours || "").trim();
  if (!v || v === "—" || v === "-") return false;
  if (/^hours not/i.test(v) || /^see (the )?centre/i.test(v) || /^tbd$/i.test(v)) return false;
  return v.length >= 4;
}

export function hasRealLicense(d: Pick<Daycare, "licenseNumber" | "id">) {
  const n = officialLicenceNumber(d.licenseNumber, d.id);
  if (!n) return false;
  if (n === d.id || n === (d.id || "").split("-").pop()) return false;
  return true;
}

export function hasRealPhoto(d: Pick<Daycare, "photos">) {
  return (d.photos ?? []).some((p) => isRealListingPhoto(p));
}

export function listingCompleteness(d: Pick<
  Daycare,
  | "id"
  | "province"
  | "infantMonthly"
  | "toddlerMonthly"
  | "preschoolMonthly"
  | "partTimeMonthly"
  | "agesKnown"
  | "ageMinMonths"
  | "ageMaxMonths"
  | "hours"
  | "licenseNumber"
  | "photos"
>): Completeness {
  const hasFees = hasFeeOrProgram(d);
  const hasAges = hasConfirmedAges(d);
  const hasHours = hasListedHours(d.hours);
  const hasLicense = hasRealLicense(d);
  const hasPhoto = hasRealPhoto(d);
  const missing: CompletenessField[] = [];
  if (!hasFees) missing.push("fees");
  if (!hasAges) missing.push("ages");
  if (!hasHours) missing.push("hours");
  if (!hasLicense) missing.push("license");
  if (!hasPhoto) missing.push("photo");
  const have = 5 - missing.length;
  return {
    ready: missing.length === 0,
    score: have,
    missing,
    hasFees,
    hasAges,
    hasHours,
    hasLicense,
    hasPhoto,
  };
}

export function relativeAge(ms: number): RelativeAge {
  const abs = Math.max(0, ms);
  const min = Math.floor(abs / 60_000);
  if (min < 1) return { unit: "now", count: 0 };
  if (min < 60) return { unit: "minute", count: min };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { unit: "hour", count: hr };
  const day = Math.floor(hr / 24);
  if (day < 30) return { unit: "day", count: day };
  return { unit: "month", count: Math.max(1, Math.floor(day / 30)) };
}

export function vacancyFreshness(updatedAt?: string | null, now = Date.now()): VacancyFreshness {
  if (!updatedAt) return { kind: "unknown", age: null };
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return { kind: "unknown", age: null };
  const ageMs = now - ts;
  const age = relativeAge(ageMs);
  return {
    kind: ageMs > VACANCY_STALE_MS ? "stale" : "fresh",
    age,
    updatedAt,
  };
}

export function vacancyTimestamp(d: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">) {
  return d.lastVacancyUpdatedAt ?? d.spotsUpdatedAt ?? null;
}

/** Stamp derived honesty fields. Does not invent a vacancy time. */
export function applyListingReadiness<T extends Daycare>(d: T): T {
  const complete = listingCompleteness(d);
  const vacancyAt = vacancyTimestamp(d);
  return {
    ...d,
    lastVacancyUpdatedAt: vacancyAt,
    spotsUpdatedAt: vacancyAt,
    availabilityKnown: Boolean(vacancyAt),
    detailsReady: complete.ready,
    completenessMissing: complete.missing,
    feeConfirmed: hasListedFees(d),
  };
}

/** Centre-desk health fields. Vacancy is missing until a real confirm timestamp exists. */
export const HEALTH_FIELDS = ["fees", "ages", "photo", "hours", "vacancy"] as const;
export type HealthField = (typeof HEALTH_FIELDS)[number];

export type ListingHealth = {
  score: number;
  total: number;
  percent: number;
  missing: HealthField[];
  vacancyAt: string | null;
};

export function listingHealth(
  d: Pick<
    Daycare,
    | "id"
    | "province"
    | "infantMonthly"
    | "toddlerMonthly"
    | "preschoolMonthly"
    | "partTimeMonthly"
    | "agesKnown"
    | "ageMinMonths"
    | "ageMaxMonths"
    | "hours"
    | "photos"
    | "lastVacancyUpdatedAt"
    | "spotsUpdatedAt"
  >,
): ListingHealth {
  const vacancyAt = vacancyTimestamp(d);
  const missing: HealthField[] = [];
  if (!hasFeeOrProgram(d)) missing.push("fees");
  if (!hasConfirmedAges(d)) missing.push("ages");
  if (!hasRealPhoto(d)) missing.push("photo");
  if (!hasListedHours(d.hours)) missing.push("hours");
  if (!vacancyAt) missing.push("vacancy");
  const total = HEALTH_FIELDS.length;
  const score = total - missing.length;
  return {
    score,
    total,
    percent: Math.round((score / total) * 100),
    missing,
    vacancyAt,
  };
}

export const HEALTH_FIELD_ANCHOR: Record<HealthField, string> = {
  fees: "listing-health-fees",
  ages: "listing-health-ages",
  photo: "listing-health-photo",
  hours: "listing-health-hours",
  vacancy: "listing-health-vacancy",
};

/**
 * Legacy ranking points (claim + freshness + completeness). Incomplete listings stay in the set.
 * Public 0–100 score lives in src/lib/quality.ts.
 * Does not invent vacancy times — only a real confirm can boost freshness.
 */
export function listingQualityScore(
  item: TrustListing &
    Pick<
      Daycare,
      | "id"
      | "province"
      | "infantMonthly"
      | "toddlerMonthly"
      | "preschoolMonthly"
      | "partTimeMonthly"
      | "agesKnown"
      | "ageMinMonths"
      | "ageMaxMonths"
      | "hours"
      | "licenseNumber"
      | "photos"
      | "lastVacancyUpdatedAt"
      | "spotsUpdatedAt"
      | "priority"
    >,
): number {
  let score = 0;
  if (isClaimVerified(item)) score += 3;
  const vacancy = vacancyFreshness(vacancyTimestamp(item));
  if (vacancy.kind === "fresh") score += 2;
  score += listingCompleteness(item).score;
  if (item.priority) score += 1;
  return score;
}
