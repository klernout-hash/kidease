/**
 * Compare rows a parent can trust.
 * A dollar amount is a centre-confirmed monthly fee, or a published daily
 * parent fee for a program this centre is actually on. Nothing is estimated
 * from household income, and a daily cap is never turned into a month.
 */

import { formatCad } from "./cad-format.ts";
import { doorDistanceKm } from "./card-distance.ts";
import { dailyCapDollars, knownListingMonthlyFee, type ListingFeeInput } from "./listing-fee.ts";
import { listingSubsidy, subsidyLabel } from "./fee-program.ts";
import { parentListingMonthlyFee } from "./public-fees.ts";

export type ComparePoint = { lat: number; lng: number; label?: string };

export function compareFeeAfterSubsidy(
  listing: ListingFeeInput & { fromPrice?: number | null },
  locale: "en" | "fr",
): string {
  const monthly = confirmedParentMonthly(listing);
  const subsidy = listingSubsidy(listing);
  const program = subsidy ? subsidyLabel(subsidy, locale) : "";
  const amount = monthly != null ? cad(monthly, locale) : "";
  if (amount && program) return `${amount} · ${program}`;
  if (amount) return amount;
  const daily = dailyCapDollars(listing);
  if (daily != null) {
    const day = dailyParentFee(daily, locale);
    return program ? `${day} · ${program}` : day;
  }
  if (program) return program;
  return locale === "fr" ? "Demandez au centre" : "Ask the centre";
}

function confirmedParentMonthly(listing: ListingFeeInput & { fromPrice?: number | null }): number | null {
  const fromCard = parentListingMonthlyFee(listing);
  if (fromCard != null) return fromCard;
  if (!listing.feeConfirmed && listing.feeConfidence !== "centre") return null;
  return knownListingMonthlyFee(listing);
}

function cad(amount: number, locale: "en" | "fr"): string {
  return formatCad(amount, locale === "fr" ? "fr-CA" : "en-CA", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}

function dailyParentFee(daily: number, locale: "en" | "fr"): string {
  const digits = Number.isInteger(daily) ? 0 : 2;
  if (locale === "fr") {
    return `${daily.toLocaleString("fr-CA", { minimumFractionDigits: digits, maximumFractionDigits: 2 })} $ par jour`;
  }
  return `$${digits ? daily.toFixed(2) : String(daily)} a day`;
}

/** Saved commute address wins. Otherwise the home pin the parent already set. */
export function compareDistancePoint(input: {
  home: ComparePoint | null;
  commute: ComparePoint | null;
  located: boolean;
}): { point: ComparePoint; from: "commute" | "home" } | null {
  const commute = usable(input.commute);
  if (commute) return { point: commute, from: "commute" };
  const home = usable(input.home);
  if (input.located && home && (home.label || "").trim()) return { point: home, from: "home" };
  return null;
}

export function compareDistanceKm(
  source: { point: ComparePoint } | null,
  centre: { lat?: number | null; lng?: number | null },
): number | null {
  if (!source) return null;
  return doorDistanceKm(source.point, centre);
}

function usable(point: ComparePoint | null): ComparePoint | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (point.lat === 0 && point.lng === 0) return null;
  return point;
}
