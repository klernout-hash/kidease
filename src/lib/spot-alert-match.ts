/**
 * Match a newly posted open spot to a saved search.
 * Age, area, and start date must fit. Missing coordinates are not invented.
 * One alert per listing per parent, and three alerts per parent per day.
 * A digest watch still counts toward those caps and is one bundled send.
 * Nothing here sends mail, SMS, or push. Callers send only when `send` is true,
 * which follows FEATURE_OPEN_SPOT_ALERTS.
 */

import { haversineKm } from "./geo.ts";
import { winnipegDayKey } from "./search-alert-policy.ts";

export const OPEN_SPOT_DAILY_CAP = 3;
export const OPEN_SPOT_START_DAYS = 90;

export type SpotAgeBand = "any" | "infant" | "toddler" | "preschool" | "school-age";

export type PostedSpot = {
  listingId: string;
  city: string;
  lat: number | null;
  lng: number | null;
  /** Set when the search job already measured distance from a real origin. */
  distanceKm?: number | null;
  agesKnown: boolean;
  ageMinMonths: number;
  ageMaxMonths: number;
  spotsInfant: number;
  spotsToddler: number;
  spotsPreschool: number;
};

export type SpotSearchWatch = {
  id: string;
  parentId: string;
  ageBand: SpotAgeBand;
  childAgeMonths: number | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  startDate: string | null;
  digest: boolean;
};

export type PriorSpotAlert = {
  parentId: string;
  listingId: string;
  day: string;
};

export type PlannedSpotAlert = {
  parentId: string;
  listingId: string;
  savedSearchId: string;
  channel: "now" | "digest";
};

export type HeldSpotAlert = PlannedSpotAlert & { reason: "listing" | "daily" };

export type OpenSpotPlan = {
  matches: PlannedSpotAlert[];
  held: HeldSpotAlert[];
  send: boolean;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cityKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function spotCount(spot: PostedSpot, band: "infant" | "toddler" | "preschool") {
  const raw = band === "infant" ? spot.spotsInfant : band === "toddler" ? spot.spotsToddler : spot.spotsPreschool;
  return Math.max(0, Math.round(raw) || 0);
}

function ageBucket(months: number): "infant" | "toddler" | "preschool" | null {
  if (!Number.isFinite(months) || months < 0) return null;
  if (months < 18) return "infant";
  if (months < 36) return "toddler";
  if (months < 72) return "preschool";
  return null;
}

/** Confirmed age range and a real spot in that band. Unknown ages do not match a named age. */
export function spotAgeFits(watch: Pick<SpotSearchWatch, "ageBand" | "childAgeMonths">, spot: PostedSpot): boolean {
  const posted = spotCount(spot, "infant") + spotCount(spot, "toddler") + spotCount(spot, "preschool") > 0;
  if (!posted) return false;
  if (watch.childAgeMonths != null) {
    if (spot.agesKnown !== true) return false;
    if (watch.childAgeMonths < spot.ageMinMonths || watch.childAgeMonths > spot.ageMaxMonths) return false;
    const bucket = ageBucket(watch.childAgeMonths);
    return bucket != null && spotCount(spot, bucket) > 0;
  }
  if (watch.ageBand === "any") return true;
  if (spot.agesKnown !== true) return false;
  if (watch.ageBand === "infant") {
    return spotCount(spot, "infant") > 0 && spot.ageMinMonths <= 18 && spot.ageMaxMonths >= 0;
  }
  if (watch.ageBand === "toddler") {
    return spotCount(spot, "toddler") > 0 && spot.ageMinMonths < 36 && spot.ageMaxMonths >= 18;
  }
  if (watch.ageBand === "preschool") {
    return spotCount(spot, "preschool") > 0 && spot.ageMaxMonths >= 30 && spot.ageMinMonths < 72;
  }
  return false;
}

/** Radius from a real origin, else the same city. No default coordinate. */
export function spotAreaFits(watch: SpotSearchWatch, spot: PostedSpot): boolean {
  const radius = finite(watch.radiusKm) ? Math.min(50, Math.max(1, Math.round(watch.radiusKm))) : null;
  if (finite(watch.lat) && finite(watch.lng) && finite(spot.lat) && finite(spot.lng) && radius != null) {
    return haversineKm({ lat: watch.lat, lng: watch.lng }, { lat: spot.lat, lng: spot.lng }) <= radius;
  }
  if (radius != null && finite(spot.distanceKm)) return spot.distanceKm <= radius;
  const left = cityKey(watch.city);
  const right = cityKey(spot.city);
  return Boolean(left && right && left === right);
}

/** No start date means the parent did not set one. A date more than 90 days away does not match. */
export function spotStartFits(startDate: string | null | undefined, now: Date): boolean {
  const raw = String(startDate || "").trim().slice(0, 10);
  if (!raw) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const ts = Date.parse(`${raw}T12:00:00Z`);
  if (!Number.isFinite(ts)) return false;
  const days = Math.round((ts - now.getTime()) / 86_400_000);
  return days <= OPEN_SPOT_START_DAYS;
}

export function spotMatchesWatch(watch: SpotSearchWatch, spot: PostedSpot, now: Date): boolean {
  return spotAgeFits(watch, spot) && spotAreaFits(watch, spot) && spotStartFits(watch.startDate, now);
}

export function planOpenSpotAlerts(input: {
  spots: PostedSpot[];
  watches: SpotSearchWatch[];
  prior: PriorSpotAlert[];
  now?: Date;
  sendEnabled: boolean;
}): OpenSpotPlan {
  const now = input.now ?? new Date();
  const today = winnipegDayKey(now);
  const seenListing = new Set<string>();
  const sentToday = new Map<string, number>();
  for (const row of input.prior) {
    if (!row.parentId || !row.listingId) continue;
    seenListing.add(`${row.parentId}:${row.listingId}`);
    if (row.day === today) sentToday.set(row.parentId, (sentToday.get(row.parentId) ?? 0) + 1);
  }
  const matches: PlannedSpotAlert[] = [];
  const held: HeldSpotAlert[] = [];
  const claimed = new Set<string>();
  for (const spot of input.spots) {
    if (!spot.listingId) continue;
    for (const watch of input.watches) {
      if (!watch.parentId) continue;
      if (!spotMatchesWatch(watch, spot, now)) continue;
      const key = `${watch.parentId}:${spot.listingId}`;
      if (seenListing.has(key) || claimed.has(key)) {
        held.push({
          parentId: watch.parentId,
          listingId: spot.listingId,
          savedSearchId: watch.id,
          channel: watch.digest ? "digest" : "now",
          reason: "listing",
        });
        continue;
      }
      const used = sentToday.get(watch.parentId) ?? 0;
      if (used >= OPEN_SPOT_DAILY_CAP) {
        held.push({
          parentId: watch.parentId,
          listingId: spot.listingId,
          savedSearchId: watch.id,
          channel: watch.digest ? "digest" : "now",
          reason: "daily",
        });
        continue;
      }
      const channel = watch.digest ? "digest" : "now";
      matches.push({
        parentId: watch.parentId,
        listingId: spot.listingId,
        savedSearchId: watch.id,
        channel,
      });
      claimed.add(key);
      sentToday.set(watch.parentId, used + 1);
    }
  }
  return { matches, held, send: input.sendEnabled === true };
}

/** Cap check for a spot that already matched. Does not invent a new age or area fit. */
export function openSpotCapAllows(prior: PriorSpotAlert[], parentId: string, listingId: string, today: string): boolean {
  if (!parentId || !listingId) return false;
  if (prior.some((row) => row.parentId === parentId && row.listingId === listingId)) return false;
  const used = prior.filter((row) => row.parentId === parentId && row.day === today).length;
  return used < OPEN_SPOT_DAILY_CAP;
}

export function openSpotMailListingIds(plan: OpenSpotPlan, parentId: string): Set<string> {
  if (!plan.send) return new Set();
  const ids = new Set<string>();
  for (const row of plan.matches) {
    if (row.parentId === parentId) ids.add(row.listingId);
  }
  return ids;
}

export function immediateSpotListingIds(plan: OpenSpotPlan, parentId: string): Set<string> {
  if (!plan.send) return new Set();
  const ids = new Set<string>();
  for (const row of plan.matches) {
    if (row.parentId === parentId && row.channel === "now") ids.add(row.listingId);
  }
  return ids;
}
