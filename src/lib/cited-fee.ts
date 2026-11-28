/**
 * One rule for "this centre's fee is known".
 *
 * A fee shows to parents, and counts as confirmed in /api/health, only when it
 * belongs to this listing and has a fee-specific citation. A general listing
 * source can refer to the address, ages or photos. No fee data is changed.
 */

import { CATALOGUE_MONTHLY_FEE_GUESS } from "./fee-confidence.ts";

export type CitedFeeInput = {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  feeConfidence?: string | null;
  factSource?: string | null;
};

/**
 * Government pages that publish province- or city-wide rates (CWELCC caps,
 * $10-a-day, regional averages). A fee cited only to one of these is a
 * default, not this centre's own price.
 */
const GOVERNMENT_SOURCE_PATTERN =
  "(^|[^a-z0-9])(gov\\.[a-z]{2}\\.ca|canada\\.ca|ontario\\.ca|quebec\\.ca|alberta\\.ca|saskatchewan\\.ca|novascotia\\.ca|gnb\\.ca|princeedwardisland\\.ca|yukon\\.ca|toronto\\.ca|ottawa\\.ca|winnipeg\\.ca|calgary\\.ca|edmonton\\.ca|vancouver\\.ca|montreal\\.ca|mamanprevoyante\\.gouv|gouv\\.qc\\.ca)([^a-z0-9]|$)";

const FEE_SOURCE_PATTERN = "(^|[^a-z0-9])(fees?|rates?|pricing|tuition|tarifs?|frais)([^a-z0-9]|$)";
const FEE_SOURCE = new RegExp(FEE_SOURCE_PATTERN, "i");

const GOVERNMENT_SOURCE = new RegExp(GOVERNMENT_SOURCE_PATTERN, "i");

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** True for a fact_source that is only a province, territory or city page. */
export function isDefaultFeeSource(source: string | null | undefined): boolean {
  const text = String(source ?? "").trim();
  if (!text) return false;
  return GOVERNMENT_SOURCE.test(text);
}

/** True when the listing row says its fee is its own and cited. Ignores amounts. */
export function feeIsCitedListingFee(d: Pick<CitedFeeInput, "feeConfidence" | "factSource">): boolean {
  const confidence = norm(d.feeConfidence);
  if (confidence === "estimate") return false;
  const source = String(d.factSource ?? "").trim();
  return FEE_SOURCE.test(source) && !isDefaultFeeSource(source);
}

function realAmount(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && Math.abs(value - CATALOGUE_MONTHLY_FEE_GUESS) >= 0.001;
}

/** A real stored amount (not blank, not the 218 catalogue guess) that is also cited. */
export function hasCitedListingFee(d: CitedFeeInput): boolean {
  if (!feeIsCitedListingFee(d)) return false;
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].some(realAmount);
}

/** SQL twin of feeIsCitedListingFee for counts on the daycares table. */
export const CITED_LISTING_FEE_SQL = `(
  lower(btrim(coalesce(fee_confidence, ''))) <> 'estimate'
  and coalesce(fact_source, '') ~* '${FEE_SOURCE_PATTERN}'
  and coalesce(fact_source, '') !~* '${GOVERNMENT_SOURCE_PATTERN}'
)`;

/** SQL: at least one real stored amount (not blank, not the 218 catalogue guess). */
export const REAL_LISTING_FEE_AMOUNT_SQL = `(
  (coalesce(infant_monthly, 0) > 0 and coalesce(infant_monthly, 0) <> ${CATALOGUE_MONTHLY_FEE_GUESS})
  or (coalesce(toddler_monthly, 0) > 0 and coalesce(toddler_monthly, 0) <> ${CATALOGUE_MONTHLY_FEE_GUESS})
  or (coalesce(preschool_monthly, 0) > 0 and coalesce(preschool_monthly, 0) <> ${CATALOGUE_MONTHLY_FEE_GUESS})
  or (coalesce(part_time_monthly, 0) > 0 and coalesce(part_time_monthly, 0) <> ${CATALOGUE_MONTHLY_FEE_GUESS})
)`;
