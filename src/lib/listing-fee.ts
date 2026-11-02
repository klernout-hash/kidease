/**
 * A centre fee the catalogue actually stored.
 * 218 is the harvested placeholder and is never treated as a parent fee.
 */

import { confirmedStoredFeeProgram, listingSubsidy, CATALOGUE_MONTHLY_FEE_GUESS } from "./fee-program.ts";
import { BILLING_DAYS_PER_MONTH, type CostAgeBand } from "./net-cost-engine.ts";

export type ListingFeeInput = {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  /**
   * Kept so older callers still type-check. A daily cap is not turned into a monthly fee.
   */
  programDaily?: number | null;
  feeProgram?: string | null;
  province?: string | null;
  city?: string | null;
  name?: string | null;
  amenities?: string | null;
  facilityType?: string | null;
  feeConfirmed?: boolean | null;
  feeConfidence?: string | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
};

/** True when a monthly figure is just a daily cap times a billing-day guess. */
export function isDerivedFromDailyCap(amount: number | null | undefined, daily: number | null | undefined): boolean {
  if (amount == null || daily == null || !Number.isFinite(amount) || !Number.isFinite(daily)) return false;
  if (daily <= 0 || daily >= 80 || amount <= 0) return false;
  const derived = Math.round(daily * BILLING_DAYS_PER_MONTH * 100) / 100;
  return Math.abs(amount - derived) <= 0.51 || Math.round(amount) === Math.round(derived);
}

/** $10 or $9.65 when this listing's public fee line is a daily cap. */
export function dailyCapDollars(listing: ListingFeeInput): number | null {
  if (confirmedStoredFeeProgram(listing) === "mb-10-day") return 10;
  const subsidy = listingSubsidy(listing);
  if (!subsidy) return null;
  if (subsidy.subsidy_type === "ten" || subsidy.subsidy_type === "ten_max") return 10;
  if (subsidy.subsidy_type === "qc_965") return 9.65;
  return null;
}

/**
 * Monthly amount safe to print on a public listing.
 * Manitoba's $10-a-day cap stays a daily cap. A catalogue conversion of any
 * daily cap stays hidden unless the centre saved the monthly figure itself.
 */
export function publicMonthlyFee(amount: number | null | undefined, listing: ListingFeeInput): number | null {
  const real = realMonthlyFee(amount);
  if (real == null) return null;
  if (confirmedStoredFeeProgram(listing) === "mb-10-day") return null;
  const centre = String(listing.feeConfidence || "").trim().toLowerCase() === "centre";
  const daily = dailyCapDollars(listing);
  if (!centre && daily != null && isDerivedFromDailyCap(real, daily)) return null;
  return real;
}

export function realMonthlyFee(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (Math.abs(value - CATALOGUE_MONTHLY_FEE_GUESS) < 0.001) return null;
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
  if (band) return publicMonthlyFee(band, input);
  const any = [
    realMonthlyFee(input.infantMonthly),
    realMonthlyFee(input.toddlerMonthly),
    realMonthlyFee(input.preschoolMonthly),
    realMonthlyFee(input.partTimeMonthly),
  ].find((fee) => fee != null);
  if (any) return publicMonthlyFee(any, input);
  return null;
}
