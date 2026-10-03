import agesCsv from "../../../data/ops/ages-sourced-20261002.csv?raw";
import type { AgeQuery } from "../sourced-ages.ts";
import { advanceSourcedAgeFill, probeAgeListings } from "../sourced-ages.ts";

/** Listings Kyle asked to see on the live site after the fill. */
export const AGE_PROBE_IDS = ["mb-9654", "mb-102660", "mb-1172", "bc-2", "ns-5515087"] as const;

export const AGE_PROBE_SLUGS = [
  "st-maurice-day-care-inc-9654",
  "river-east-montessori-school-inc-102660",
  "cuddles-infant-centre-1172",
  "willow-point-children-s-centre-2",
  "east-hants-childcare-centre-5515087",
] as const;

export function runtimeSourcedAgesCsv() {
  return agesCsv;
}

export function advanceRuntimeSourcedAges(query: AgeQuery) {
  return advanceSourcedAgeFill(query, agesCsv);
}

export function probeRuntimeAgeListings(query: AgeQuery) {
  return probeAgeListings(query, AGE_PROBE_IDS, AGE_PROBE_SLUGS);
}
