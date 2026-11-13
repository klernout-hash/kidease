import { publicMonthlyFee, type ListingFeeInput } from "./listing-fee.ts";

/** Public centre fees are available independently of KidEase subscription sales. */
export function parentListingFeesVisible(): boolean {
  return true;
}

/** Require centre fee evidence and never turn a daily cap into a monthly quote. */
export function parentListingMonthlyFee(listing: ListingFeeInput & {
  fromPrice?: number | null;
}): number | null {
  if (!listing.feeConfirmed && listing.feeConfidence !== "centre") return null;
  return publicMonthlyFee(listing.fromPrice, listing);
}
