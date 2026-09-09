/**
 * NOW-loop helpers shared by search, cards, rails, compare, and vacancy.
 * Ages, fees, CWELCC, and openings are never invented.
 */

import { matchesRailAge, type RailAge } from "@/lib/care-type";
import { hasAmenity } from "@/lib/licensing";
import {
  hasConfirmedAges,
  hasListedFees,
  hasRealPhoto,
  vacancyFreshness,
  vacancyTimestamp,
} from "@/lib/listing-readiness";
import type { Daycare } from "@/lib/types";

export const SEARCH_AGES = ["infant", "toddler", "preschool", "school-age"] as const;
export type SearchAge = (typeof SEARCH_AGES)[number];

export const SEARCH_STARTS = ["now", "this-month", "next-month"] as const;
export type SearchStart = (typeof SEARCH_STARTS)[number];

export type LiveLookingGap = "ages" | "fees" | "photo";

export type LiveLookingInput = Pick<
  Daycare,
  | "agesKnown"
  | "ageMinMonths"
  | "ageMaxMonths"
  | "infantMonthly"
  | "toddlerMonthly"
  | "preschoolMonthly"
  | "partTimeMonthly"
  | "amenities"
  | "photos"
  | "province"
  | "feeConfirmed"
>;

export type VacancyHonestyInput = Pick<
  Daycare,
  | "live"
  | "claimed"
  | "claimStatus"
  | "lastVacancyUpdatedAt"
  | "spotsUpdatedAt"
  | "spotsInfant"
  | "spotsToddler"
  | "spotsPreschool"
  | "availabilityKnown"
> & {
  spotsTotal?: number;
};

export type HonestVacancy =
  | { kind: "unknown"; labelKey: "availabilityUnknown" }
  | { kind: "confirm"; labelKey: "confirmWithCentre" }
  | { kind: "open"; labelKey: "spots"; spots: number }
  | { kind: "waitlist"; labelKey: "waitlist"; spots: 0 };

export function isSearchAge(raw: unknown): raw is SearchAge {
  return SEARCH_AGES.includes(raw as SearchAge);
}

export function isSearchStart(raw: unknown): raw is SearchStart {
  return SEARCH_STARTS.includes(raw as SearchStart);
}

/** Results must not render until age band + start window are chosen. */
export function searchFiltersReady(age?: string | null, start?: string | null): boolean {
  return isSearchAge(age) && isSearchStart(start);
}

export function hasPlaceForSearch(q?: string | null, label?: string | null, located?: boolean): boolean {
  if (located) return true;
  return Boolean((q || label || "").trim());
}

/**
 * Listed monthly fee or a per-centre program amenity.
 * Province-typical $10-a-day is not enough — that would guess.
 */
export function hasConfirmedFeeLine(
  d: Pick<
    Daycare,
    | "infantMonthly"
    | "toddlerMonthly"
    | "preschoolMonthly"
    | "partTimeMonthly"
    | "amenities"
    | "feeConfirmed"
  >,
): boolean {
  if (hasListedFees(d)) return true;
  if (!d.feeConfirmed) return false;
  const amenities = d.amenities || "";
  return hasAmenity(amenities, "ten-a-day") || hasAmenity(amenities, "funded");
}

/**
 * $10-a-day / $15-a-day / Québec reduced badge only when this centre
 * confirmed the program. Harvest amenities and province defaults are not enough.
 * Québec is never stamped $10-a-day.
 */
export function confirmedFeeProgramBadge(
  d: Pick<Daycare, "province" | "amenities" | "feeConfirmed">,
): "badgeTen" | "badgeFifteen" | "badgeReducedQc" | null {
  if (!d.feeConfirmed) return null;
  const amenities = d.amenities || "";
  const ten = hasAmenity(amenities, "ten-a-day");
  const funded = hasAmenity(amenities, "funded");
  if (!ten && !funded) return null;
  const province = (d.province || "").toUpperCase();
  if (province === "QC") return "badgeReducedQc";
  if (province === "AB") return "badgeFifteen";
  if (ten) return "badgeTen";
  return null;
}

export function liveLookingGaps(d: LiveLookingInput): LiveLookingGap[] {
  const gaps: LiveLookingGap[] = [];
  if (!hasConfirmedAges(d)) gaps.push("ages");
  if (!hasConfirmedFeeLine(d)) gaps.push("fees");
  if (!hasRealPhoto(d)) gaps.push("photo");
  return gaps;
}

/** Shared live-looking rule — do not fork per page. */
export function isLiveLookingCard(d: LiveLookingInput): boolean {
  return liveLookingGaps(d).length === 0;
}

export function canShowMatchScore(d: LiveLookingInput): boolean {
  return hasConfirmedAges(d) && hasConfirmedFeeLine(d);
}

export function listingAgeUnknown(d: Pick<Daycare, "agesKnown" | "ageMinMonths" | "ageMaxMonths">): boolean {
  return !hasConfirmedAges(d);
}

export function listingServesSearchAge(
  d: Pick<Daycare, "agesKnown" | "ageMinMonths" | "ageMaxMonths" | "amenities">,
  age: SearchAge,
): boolean {
  if (listingAgeUnknown(d)) return false;
  return matchesRailAge(d, age);
}

export function isLiveOrClaimed(
  d: Pick<Daycare, "live" | "claimed" | "claimStatus">,
): boolean {
  if (d.live) return true;
  const status = (d.claimStatus || "").trim().toLowerCase();
  return Boolean(d.claimed) && ["approved", "live", "active", "published"].includes(status);
}

function spotsOf(d: VacancyHonestyInput): number {
  if (typeof d.spotsTotal === "number") return d.spotsTotal;
  return (d.spotsInfant ?? 0) + (d.spotsToddler ?? 0) + (d.spotsPreschool ?? 0);
}

/**
 * Unclaimed / not Live → Availability unknown.
 * Live / claimed → show spots only when the director confirm is < 14 days.
 */
export function honestVacancy(d: VacancyHonestyInput, now = Date.now()): HonestVacancy {
  if (!isLiveOrClaimed(d)) {
    return { kind: "unknown", labelKey: "availabilityUnknown" };
  }
  const freshness = vacancyFreshness(vacancyTimestamp(d), now);
  if (freshness.kind !== "fresh") {
    return { kind: "confirm", labelKey: "confirmWithCentre" };
  }
  const spots = spotsOf(d);
  if (spots > 0) return { kind: "open", labelKey: "spots", spots };
  return { kind: "waitlist", labelKey: "waitlist", spots: 0 };
}

/** Search “now” / “next month” may only include Live centres with a fresh confirm. */
export function qualifiesStartWindow(d: VacancyHonestyInput, start: SearchStart, now = Date.now()): boolean {
  if (start === "this-month") return true;
  return isLiveOrClaimed(d) && vacancyFreshness(vacancyTimestamp(d), now).kind === "fresh";
}

export function splitSearchResults<T extends LiveLookingInput & VacancyHonestyInput>(
  rows: T[],
  age: SearchAge,
  start: SearchStart,
  now = Date.now(),
): { primary: T[]; ageUnknown: T[] } {
  const primary: T[] = [];
  const ageUnknown: T[] = [];
  for (const row of rows) {
    if (listingAgeUnknown(row)) {
      ageUnknown.push(row);
      continue;
    }
    if (!listingServesSearchAge(row, age)) continue;
    if (!qualifiesStartWindow(row, start, now)) continue;
    primary.push(row);
  }
  return { primary, ageUnknown };
}

export function liveLookingOnly<T extends LiveLookingInput>(rows: T[]): T[] {
  return rows.filter((row) => isLiveLookingCard(row));
}

export function startWindowToDate(start: SearchStart, now = new Date()): string {
  const d = new Date(now);
  if (start === "now") return d.toISOString().slice(0, 10);
  if (start === "this-month") {
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

export function parseCompareSlugs(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(",") : "";
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{2,80}$/i.test(s))
    .slice(0, 5);
}

export function compareSlugsHref(slugs: string[]): string {
  const clean = parseCompareSlugs(slugs.join(","));
  return clean.length ? `/compare?slugs=${clean.join(",")}` : "/compare";
}

export type NowLoopEvent =
  | "search_filters_applied"
  | "search_results_shown"
  | "listing_request_started"
  | "listing_request_submitted"
  | "provider_request_opened";

export const NOW_LOOP_EVENTS: readonly NowLoopEvent[] = [
  "search_filters_applied",
  "search_results_shown",
  "listing_request_started",
  "listing_request_submitted",
  "provider_request_opened",
];

export function qualityTodoFirst(issues: Array<{ id: string }>): Array<{ id: string }> {
  const first = ["incomplete_ages", "incomplete_fees", "incomplete_photo"];
  const head = first
    .map((id) => issues.find((issue) => issue.id === id))
    .filter((issue): issue is { id: string } => Boolean(issue));
  const rest = issues.filter((issue) => !first.includes(issue.id));
  return [...head, ...rest];
}

export function railAgeFromSearch(age?: string | null): RailAge | undefined {
  return isSearchAge(age) ? age : undefined;
}
