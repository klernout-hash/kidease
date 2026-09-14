import { RAIL_AGES, matchesRailAge, type RailAge } from "@/lib/care-type";
import type { CopyKey } from "@/lib/copy";
import { honestVacancy } from "@/lib/now-loops";
import type { DaycareCard as Card } from "@/lib/types";
import { uniqueById } from "@/lib/utils";

export const EXPLORE_AGE_RAIL_COPY: Record<RailAge, CopyKey> = {
  infant: "catInfants",
  toddler: "catToddlers",
  preschool: "catPreschool",
  "school-age": "catSchoolAge",
};

export const EXPLORE_RAIL_AGES = RAIL_AGES;

function take(rows: Card[], n = 18) {
  return uniqueById(rows).slice(0, n);
}

/** Closest first in the current result pool. */
export function exploreNearYouItems(items: Card[], n = 18): Card[] {
  return take(
    [...items].sort((a, b) => a.distanceKm - b.distanceKm),
    n,
  );
}

/** Only director-posted openings — never invent vacancy. */
export function exploreOpeningsItems(items: Card[], n = 18): Card[] {
  return take(
    items
      .filter((row) => honestVacancy(row).kind === "open")
      .sort((a, b) => (b.spotsTotal || 0) - (a.spotsTotal || 0) || a.distanceKm - b.distanceKm),
    n,
  );
}

export function exploreAgeRailItems(items: Card[], age: RailAge, n = 18): Card[] {
  return take(
    items
      .filter((row) => matchesRailAge(row, age))
      .sort((a, b) => a.distanceKm - b.distanceKm),
    n,
  );
}
