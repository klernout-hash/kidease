import { feeIsCitedListingFee } from "./cited-fee.ts";
import { publicMonthlyFee, type ListingFeeInput } from "./listing-fee.ts";

/** Public centre fees are available independently of KidEase subscription sales. */
export function parentListingFeesVisible(): boolean {
  return true;
}

/** Require a listing-level, cited fee (KB-55) and never turn a daily cap into a monthly quote. */
export function parentListingMonthlyFee(listing: ListingFeeInput & {
  fromPrice?: number | null;
}): number | null {
  if (!feeIsCitedListingFee(listing)) return null;
  return publicMonthlyFee(listing.fromPrice, listing);
}
