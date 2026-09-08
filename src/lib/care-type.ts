/**
 * Care-type and age-rail filters for parent explore.
 * Facility types (Centre / Nursery / Home) come from real amenities only.
 * Before-after is a program signal from amenities and hours — not a facility class.
 * School-age is amenity or confirmed max age — never invented.
 */

import { hasAmenity, opensEarly, staysLate } from "@/lib/licensing";
import { matchesAgeBand } from "@/lib/saved-search";
import {
  FACILITY_TYPES,
  classifyFacilityType,
  isFacilityType,
  matchesFacilityType,
  type FacilityType,
} from "@/lib/facility-type";
import type { AgeGroup, Daycare } from "@/lib/types";

export const CARE_TYPES = ["centre", "nursery", "home", "before-after"] as const;
export type CareType = (typeof CARE_TYPES)[number];

export { FACILITY_TYPES, isFacilityType, matchesFacilityType };
export type { FacilityType };

export const RAIL_AGES = ["infant", "toddler", "preschool", "school-age"] as const;
export type RailAge = (typeof RAIL_AGES)[number];

export function isCareType(value: string): value is CareType {
  return (CARE_TYPES as readonly string[]).includes(value);
}

export function isRailAge(value: string): value is RailAge {
  return (RAIL_AGES as readonly string[]).includes(value);
}

function isBeforeAfterProgram(item: Pick<Daycare, "amenities" | "hours">): boolean {
  const amenities = item.amenities || "";
  return (
    hasAmenity(amenities, "school-age") ||
    hasAmenity(amenities, "in-school") ||
    hasAmenity(amenities, "extended") ||
    opensEarly(item.hours || "") ||
    staysLate(item.hours || "", amenities)
  );
}

export function listingCareType(
  item: Pick<Daycare, "amenities" | "hours" | "name">,
): CareType {
  const facility = classifyFacilityType(item).type;
  if (facility === "home") return "home";
  if (facility === "nursery") return "nursery";
  if (isBeforeAfterProgram(item)) return "before-after";
  return "centre";
}

export function matchesCareType(
  item: Pick<Daycare, "amenities" | "hours" | "name">,
  care: CareType,
): boolean {
  if (care === "before-after") return isBeforeAfterProgram(item);
  return matchesFacilityType(item, care);
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
