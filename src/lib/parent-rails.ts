/**
 * Signed-in parent explore rails (Airbnb-style horizontal rows).
 *
 * Built from existing Match, Urgency, and Guest Favorites — never from
 * Paid Pro / Network, featured-city, or promote pins.
 * Empty rails stay hidden. See-all links carry the honest filter/sort.
 */

import { compareParentMatch, parentMatchScore, type ParentMatchPrefs } from "@/lib/parent-match";
import { compareParentUrgency, parentUrgencyScore, type ParentUrgencyPrefs } from "@/lib/parent-urgency";
import { matchesCareType, matchesRailAge, railAgeToSearchAge, type CareType, type RailAge } from "@/lib/care-type";
import { isPublicListing } from "@/lib/listing-visibility";
import type { DaycareCard } from "@/lib/types";

export const PARENT_RAIL_LIMIT = 12;
export const PARENT_RAIL_MIN_MATCH = 1;

export type ParentRailId = "match" | "urgency" | "favorites" | "age" | "care";

export type ParentRailSeeAll = {
  sort?: "match" | "urgency" | "recommended" | "distance";
  age?: RailAge;
  care?: CareType;
  favorites?: boolean;
};

export type ParentRail = {
  id: ParentRailId;
  items: DaycareCard[];
  seeAll: ParentRailSeeAll;
};

export type ParentRailPrefs = ParentMatchPrefs & ParentUrgencyPrefs;

function takeHonest(rows: DaycareCard[], n = PARENT_RAIL_LIMIT): DaycareCard[] {
  const seen = new Set<string>();
  const out: DaycareCard[] = [];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= n) break;
  }
  return out;
}

function alreadyScored(item: DaycareCard): boolean {
  return typeof item.matchScore === "number" && typeof item.urgencyScore === "number";
}

/** Reuse scores from a prior `scoreParentRailItems` pass so chip/tab clicks do not redo Match + Urgency. */
export function scoredParentRailItems(items: DaycareCard[], prefs: ParentRailPrefs = {}): DaycareCard[] {
  if (items.length > 0 && items.every(alreadyScored)) return items;
  return scoreParentRailItems(items, prefs);
}

/** Score a pool for rails. Paid pins are ignored by the score functions. */
export function scoreParentRailItems(items: DaycareCard[], prefs: ParentRailPrefs = {}): DaycareCard[] {
  return items.map((item) => ({
    ...item,
    matchScore: parentMatchScore(item, prefs),
    urgencyScore: parentUrgencyScore(item, prefs),
  }));
}

export function bestMatchRail(items: DaycareCard[], prefs: ParentRailPrefs = {}): DaycareCard[] {
  const scored = scoredParentRailItems(items, prefs)
    .filter((item) => (item.matchScore ?? 0) >= PARENT_RAIL_MIN_MATCH)
    .sort((a, b) => compareParentMatch(a, b, prefs));
  return takeHonest(scored);
}

export function urgencyRail(items: DaycareCard[], prefs: ParentRailPrefs = {}): DaycareCard[] {
  const scored = scoredParentRailItems(items, prefs)
    .filter((item) => (item.urgencyScore ?? 0) > 0)
    .sort((a, b) => compareParentUrgency(a, b, prefs));
  return takeHonest(scored);
}

/** Guest Favorites only — paid pins never mint this badge. */
export function guestFavoritesRail(items: DaycareCard[]): DaycareCard[] {
  const favorites = items
    .filter((item) => item.guestFavorite === true)
    .sort((a, b) => (a.distanceKm ?? 9e6) - (b.distanceKm ?? 9e6));
  return takeHonest(favorites);
}

export function ageGroupRail(items: DaycareCard[], age: RailAge, prefs: ParentRailPrefs = {}): DaycareCard[] {
  const agePrefs: ParentRailPrefs = { ...prefs, ageGroup: railAgeToSearchAge(age) };
  const scored = scoreParentRailItems(
    items.filter((item) => matchesRailAge(item, age)),
    agePrefs,
  ).sort((a, b) => compareParentMatch(a, b, agePrefs));
  return takeHonest(scored);
}

export function careTypeRail(items: DaycareCard[], care: CareType, prefs: ParentRailPrefs = {}): DaycareCard[] {
  const scored = scoredParentRailItems(
    items.filter((item) => matchesCareType(item, care)),
    prefs,
  ).sort((a, b) => compareParentMatch(a, b, prefs));
  return takeHonest(scored);
}

export function buildParentRails(
  items: DaycareCard[],
  prefs: ParentRailPrefs = {},
  chips: { age: RailAge; care: CareType } = { age: "preschool", care: "centre" },
): ParentRail[] {
  const pool = scoreParentRailItems(items.filter((item) => isPublicListing(item)), prefs);
  const rails: ParentRail[] = [
    { id: "match", items: bestMatchRail(pool, prefs), seeAll: { sort: "match" } },
    { id: "urgency", items: urgencyRail(pool, prefs), seeAll: { sort: "urgency" } },
    { id: "favorites", items: guestFavoritesRail(pool), seeAll: { favorites: true } },
    { id: "age", items: ageGroupRail(pool, chips.age, prefs), seeAll: { age: chips.age } },
    { id: "care", items: careTypeRail(pool, chips.care, prefs), seeAll: { care: chips.care } },
  ];
  return rails.filter((rail) => rail.items.length > 0);
}

export function parentRailSearchHref(seeAll: ParentRailSeeAll): string {
  const params = new URLSearchParams();
  if (seeAll.sort) params.set("sort", seeAll.sort);
  if (seeAll.age) params.set("age", seeAll.age);
  if (seeAll.care) params.set("care", seeAll.care);
  if (seeAll.favorites) params.set("favorites", "1");
  const q = params.toString();
  return q ? `/search?${q}` : "/search";
}
