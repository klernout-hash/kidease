import { currentPeriod } from "./stripe-methods.ts";

/** A paid centre bill. Net is what the centre receives after the platform fee. */
export type MonthBill = {
  status: string;
  netCents: number;
  paidAt?: string | null;
  period?: string | null;
};

export type RatedListing = {
  ratingX10: number;
  reviewCount: number;
  slug?: string | null;
};

/**
 * Sum of paid bills in this calendar month. Null when there is no paid bill,
 * so the menu can hide the card instead of showing a made-up total.
 */
export function earningsThisMonthCents(bills: readonly MonthBill[], now = new Date()): number | null {
  const month = currentPeriod(now);
  let total = 0;
  let found = false;
  for (const bill of bills) {
    if (bill.status !== "paid" || !Number.isFinite(bill.netCents)) continue;
    const paidMonth = monthOf(bill.paidAt);
    const period = String(bill.period || "").slice(0, 7);
    if (paidMonth !== month && period !== month) continue;
    total += Math.round(bill.netCents);
    found = true;
  }
  return found ? total : null;
}

/** Weighted Google rating across the centre's own listings. Null when none are rated. */
export function menuReviewSummary(
  rows: readonly RatedListing[],
): { ratingX10: number; reviewCount: number; slug: string | null } | null {
  const rated = rows.filter((row) => row.reviewCount >= 1 && row.ratingX10 > 0);
  if (!rated.length) return null;
  let weight = 0;
  let sum = 0;
  for (const row of rated) {
    weight += row.reviewCount;
    sum += row.ratingX10 * row.reviewCount;
  }
  if (weight < 1) return null;
  const only = rated.length === 1 ? rated[0] : null;
  return {
    ratingX10: Math.round(sum / weight),
    reviewCount: weight,
    slug: only?.slug ? only.slug : null,
  };
}

function monthOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return currentPeriod(date);
}
