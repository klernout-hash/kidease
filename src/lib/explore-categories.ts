/**
 * Top 7 explore categories — derived at read time from existing fields.
 * Never invent ages, amenities, CWELCC, or openings. Never write tags back
 * as a licence class. A listing may wear more than one tag.
 *
 * Age chips 1–4 also set `?age=` (comma-separated when stacked) so /search
 * filter-bar age chips stay the only age chrome.
 */

import {
  RAIL_AGES,
  isBeforeAfterProgram,
  isRailAge,
  matchesRailAge,
  type RailAge,
} from "@/lib/care-type";
import { classifyFacilityType, isHomeBasedFacility } from "@/lib/facility-type";
import { listingAgeUnknown } from "@/lib/now-loops";
import type { CopyKey } from "@/lib/copy";
import type { Daycare } from "@/lib/types";

export const EXPLORE_CATEGORIES = [
  "infant",
  "toddler",
  "preschool",
  "school-age",
  "before-after",
  "home",
  "nursery",
] as const;

export type ExploreCategory = (typeof EXPLORE_CATEGORIES)[number];

export const EXPLORE_CATEGORY_COPY: Record<ExploreCategory, CopyKey> = {
  infant: "catInfants",
  toddler: "catToddlers",
  preschool: "catPreschool",
  "school-age": "catSchoolAge",
  "before-after": "catBeforeAfter",
  home: "catHomes",
  nursery: "catNurseries",
};

export type ExploreTaggedListing = Pick<
  Daycare,
  "agesKnown" | "ageMinMonths" | "ageMaxMonths" | "amenities" | "hours" | "name"
>;

export function isExploreCategory(value: unknown): value is ExploreCategory {
  return typeof value === "string" && (EXPLORE_CATEGORIES as readonly string[]).includes(value);
}

/** Age chips 1–4 — these also set the child age-first gate. */
export function exploreCategoryToSearchAge(cat?: ExploreCategory | null): RailAge | undefined {
  return cat && isRailAge(cat) ? cat : undefined;
}

export function exploreCategorySetsAgeGate(cat?: ExploreCategory | null): boolean {
  return Boolean(exploreCategoryToSearchAge(cat));
}

/** Compute the 7 slugs a listing wears. Unknown ages → no tags 1–4. */
export function exploreTags(item: ExploreTaggedListing): ExploreCategory[] {
  const tags: ExploreCategory[] = [];
  if (!listingAgeUnknown(item)) {
    for (const age of RAIL_AGES) {
      if (matchesRailAge(item, age)) tags.push(age);
    }
  }
  if (isBeforeAfterProgram(item)) tags.push("before-after");
  const facility = classifyFacilityType(item).type;
  if (isHomeBasedFacility(facility)) tags.push("home");
  if (facility === "nursery_preschool") tags.push("nursery");
  return tags;
}

function csvTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

/** All stays visible. Age/facility chips with zero hits stay off the row. */
export function visibleExploreCategories(
  counts: Record<ExploreCategory, number>,
  selected?: ExploreCategory | readonly ExploreCategory[] | null,
): ExploreCategory[] {
  const picked = new Set(
    (Array.isArray(selected) ? selected : selected ? [selected] : []).filter(isExploreCategory),
  );
  return EXPLORE_CATEGORIES.filter((cat) => counts[cat] > 0 || picked.has(cat));
}

export function isFacilityExploreCategory(cat?: ExploreCategory | null): boolean {
  return cat === "home" || cat === "nursery" || cat === "before-after";
}

/** All / missing cat = no category filter (centres + everything). */
export function matchesCategory(
  item: ExploreTaggedListing,
  cat?: ExploreCategory | null,
): boolean {
  if (!cat) return true;
  return exploreTags(item).includes(cat);
}

/**
 * Age chips 1–4 are the search gate + All tail — do not drop unknown-age
 * rows before splitSearchResults. Facility chips stay amenity-only.
 */
export function listingMatchesExploreFilter(
  item: ExploreTaggedListing,
  cat?: ExploreCategory | null,
): boolean {
  if (!cat || !isFacilityExploreCategory(cat)) return true;
  return matchesCategory(item, cat);
}

export function countExploreCategories(
  items: readonly ExploreTaggedListing[],
): Record<ExploreCategory, number> {
  const counts = {
    infant: 0,
    toddler: 0,
    preschool: 0,
    "school-age": 0,
    "before-after": 0,
    home: 0,
    nursery: 0,
  } satisfies Record<ExploreCategory, number>;
  for (const item of items) {
    const seen = new Set<ExploreCategory>();
    for (const tag of exploreTags(item)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      counts[tag] += 1;
    }
  }
  return counts;
}

/**
 * Prefer `?cat=`. Fall back to `?age=` / `?care=` so #168 age-first links
 * and existing see-all hrefs land on the same chip.
 */
export function resolvedExploreCategory(search: {
  cat?: unknown;
  age?: unknown;
  care?: unknown;
}): ExploreCategory | undefined {
  if (isExploreCategory(search.cat)) return search.cat;
  const ages = parseExploreRailAges(search);
  if (ages.length === 1) return ages[0];
  if (isExploreCategory(search.age)) return search.age;
  if (search.care === "home" || search.care === "nursery" || search.care === "before-after") {
    return search.care;
  }
  return undefined;
}

/** `?age=infant,toddler` (and repeated / array values) — stable RAIL_AGES order. */
export function parseExploreRailAges(search: { age?: unknown; cat?: unknown }): RailAge[] {
  const tokens = csvTokens(search.age);
  const fromAge = RAIL_AGES.filter((age) => tokens.includes(age));
  if (fromAge.length) return fromAge;
  if (typeof search.cat === "string" && isRailAge(search.cat)) return [search.cat];
  return [];
}

export function formatExploreRailAges(ages: readonly RailAge[]): string | undefined {
  const unique = RAIL_AGES.filter((age) => ages.includes(age));
  return unique.length ? unique.join(",") : undefined;
}

export function toggleExploreRailAge(ages: readonly RailAge[], age: RailAge): RailAge[] {
  const next = ages.includes(age) ? ages.filter((item) => item !== age) : [...ages, age];
  return RAIL_AGES.filter((item) => next.includes(item));
}

export function exploreOpeningsSelected(search: { openings?: unknown }): boolean {
  return search.openings === "1" || search.openings === 1 || search.openings === true;
}
