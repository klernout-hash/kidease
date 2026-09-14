import { RAIL_AGES, matchesRailAge, type RailAge } from "@/lib/care-type";
import type { CopyKey } from "@/lib/copy";
import { hasRealPhoto } from "@/lib/listing-readiness";
import { honestVacancy, isLiveLookingCard } from "@/lib/now-loops";
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

/**
 * Live / complete listings first. Hollow stay in the set — we never invent
 * ages, fees, or photos to pad a rail.
 */
export function exploreCardFillRank(row: Pick<Card, "live" | "photos" | "agesKnown" | "ageMinMonths" | "ageMaxMonths" | "infantMonthly" | "toddlerMonthly" | "preschoolMonthly" | "partTimeMonthly" | "amenities" | "province" | "feeConfirmed">): number {
  const looking = isLiveLookingCard(row);
  const live = Boolean(row.live);
  const photo = hasRealPhoto(row);
  if (looking && live) return 3;
  if (live) return 2;
  if (photo) return 1;
  return 0;
}

export function preferCompleteCards<T extends Card>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const fill = exploreCardFillRank(b) - exploreCardFillRank(a);
    if (fill) return fill;
    return a.distanceKm - b.distanceKm || (b.spotsTotal || 0) - (a.spotsTotal || 0);
  });
}

/** Closest first in the current result pool, complete cards ahead of hollow. */
export function exploreNearYouItems(items: Card[], n = 18): Card[] {
  return take(
    preferCompleteCards(items),
    n,
  );
}

/** Only director-posted openings — never invent vacancy. */
export function exploreOpeningsItems(items: Card[], n = 18): Card[] {
  return take(
    items
      .filter((row) => honestVacancy(row).kind === "open")
      .sort(
        (a, b) =>
          exploreCardFillRank(b) - exploreCardFillRank(a) ||
          (b.spotsTotal || 0) - (a.spotsTotal || 0) ||
          a.distanceKm - b.distanceKm,
      ),
    n,
  );
}

export function exploreAgeRailItems(items: Card[], age: RailAge, n = 18): Card[] {
  return take(
    preferCompleteCards(items.filter((row) => matchesRailAge(row, age))),
    n,
  );
}
