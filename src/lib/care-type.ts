/**
 * Care-type and age-rail filters for parent explore.
 * Centre / home / before-after are inferred from real amenities and hours.
 * School-age is amenity or confirmed max age — never invented.
 */

import { hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { matchesAgeBand } from "@/lib/saved-search";
import type { AgeGroup, Daycare } from "@/lib/types";

export const CARE_TYPES = ["centre", "home", "before-after"] as const;
export type CareType = (typeof CARE_TYPES)[number];

export const RAIL_AGES = ["infant", "toddler", "preschool", "school-age"] as const;
export type RailAge = (typeof RAIL_AGES)[number];

export function isCareType(value: string): value is CareType {
  return (CARE_TYPES as readonly string[]).includes(value);
}

export function isRailAge(value: string): value is RailAge {
  return (RAIL_AGES as readonly string[]).includes(value);
}

export function listingCareType(
  item: Pick<Daycare, "amenities" | "hours">,
): CareType {
  const amenities = item.amenities || "";
  if (hasAmenity(amenities, "home")) return "home";
  if (
    hasAmenity(amenities, "school-age") ||
    hasAmenity(amenities, "in-school") ||
    hasAmenity(amenities, "extended") ||
    opensEarly(item.hours || "") ||
    staysLate(item.hours || "", amenities)
  ) {
    return "before-after";
  }
  return "centre";
}

export function matchesCareType(
  item: Pick<Daycare, "amenities" | "hours">,
  care: CareType,
): boolean {
  if (care === "home") return hasAmenity(item.amenities || "", "home");
  if (care === "before-after") {
    const amenities = item.amenities || "";
    return (
      hasAmenity(amenities, "school-age") ||
      hasAmenity(amenities, "in-school") ||
      hasAmenity(amenities, "extended") ||
      opensEarly(item.hours || "") ||
      staysLate(item.hours || "", amenities)
    );
  }
  return !hasAmenity(item.amenities || "", "home");
}

export function matchesRailAge(
  item: Pick<Daycare, "agesKnown" | "ageMinMonths" | "ageMaxMonths" | "amenities">,
  age: RailAge,
): boolean {
  if (age === "school-age") {
    if (hasAmenity(item.amenities || "", "school-age")) return true;
    return Boolean(item.agesKnown && item.ageMaxMonths >= 60);
  }
  return matchesAgeBand(age, item);
}

export function railAgeToSearchAge(age: RailAge): "any" | AgeGroup {
  if (age === "school-age") return "any";
  return age;
}

/** Coerce chip / query / agent-typed strings so AgeGroup never fails tsc. */
export function parseAgeGroup(value: unknown): AgeGroup | "any" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "infant" || raw === "toddler" || raw === "preschool") return raw;
  return "any";
}
