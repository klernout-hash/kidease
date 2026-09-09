/**
 * Top 7 explore categories — derived at read time from existing fields.
 * Never invent ages, amenities, CWELCC, or openings. Never write tags back
 * as a licence class. A listing may wear more than one tag.
 *
 * Age chips 1–4 also set the age-first search gate (`?age=` / child age band)
 * so this composes with NOW-loops (#168) as one chip row + age gate.
 */

import {
  RAIL_AGES,
  isBeforeAfterProgram,
  isRailAge,
  matchesRailAge,
  type RailAge,
} from "@/lib/care-type";
import { classifyFacilityType } from "@/lib/facility-type";
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
  for (const age of RAIL_AGES) {
    if (matchesRailAge(item, age)) tags.push(age);
  }
  if (isBeforeAfterProgram(item)) tags.push("before-after");
  const facility = classifyFacilityType(item).type;
  if (facility === "home") tags.push("home");
  if (facility === "nursery") tags.push("nursery");
  return tags;
}

/** All / missing cat = no category filter (centres + everything). */
export function matchesCategory(
  item: ExploreTaggedListing,
  cat?: ExploreCategory | null,
): boolean {
  if (!cat) return true;
  return exploreTags(item).includes(cat);
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
  if (isExploreCategory(search.age)) return search.age;
  if (search.care === "home" || search.care === "nursery" || search.care === "before-after") {
    return search.care;
  }
  return undefined;
}
