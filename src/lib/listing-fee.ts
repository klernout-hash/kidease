/**
 * A centre fee the catalogue actually stored.
 * 218 is the harvested placeholder and is never treated as a parent fee.
 */

import { CATALOGUE_MONTHLY_FEE_GUESS } from "./fee-program.ts";
import { BILLING_DAYS_PER_MONTH, type CostAgeBand } from "./net-cost-engine.ts";

export type ListingFeeInput = {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  /** Program daily amount already stored for this centre, such as $10 or $9.65. */
  programDaily?: number | null;
};

export function realMonthlyFee(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (Math.round(value) === CATALOGUE_MONTHLY_FEE_GUESS) return null;
  return Math.round(value * 100) / 100;
}

export function knownListingMonthlyFee(input: ListingFeeInput, ageBand: CostAgeBand = "preschool"): number | null {
  const band =
    ageBand === "infant"
      ? realMonthlyFee(input.infantMonthly)
      : ageBand === "toddler"
        ? realMonthlyFee(input.toddlerMonthly)
        : ageBand === "preschool"
          ? realMonthlyFee(input.preschoolMonthly)
          : realMonthlyFee(input.partTimeMonthly) ?? realMonthlyFee(input.preschoolMonthly);
  if (band) return band;
  const any = [
    realMonthlyFee(input.infantMonthly),
    realMonthlyFee(input.toddlerMonthly),
    realMonthlyFee(input.preschoolMonthly),
    realMonthlyFee(input.partTimeMonthly),
  ].find((fee) => fee != null);
  if (any) return any;
  const daily = input.programDaily;
  if (ageBand !== "school-age" && daily != null && Number.isFinite(daily) && daily > 0 && daily < 80) {
    return Math.round(daily * BILLING_DAYS_PER_MONTH * 100) / 100;
  }
  return null;
}
