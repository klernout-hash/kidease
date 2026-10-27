import { earningsThisMonthCents, type MonthBill } from "./menu-summary.ts";
import { parentReviewSummary } from "./review-gate.ts";
import { currentPeriod } from "./stripe-methods.ts";

/** A centre bill the daycare can see. Amounts are net cents (what the centre receives). */
export type HostBill = {
  id: string;
  status: string;
  netCents: number;
  period: string | null;
  paidAt: string | null;
  dueAt: string | null;
  parentName: string | null;
  childName: string | null;
  number: string | null;
  centreName: string | null;
};

export type MonthBar = { period: string; cents: number };

export type HostEarnings = {
  ok: boolean;
  thisMonthCents: number | null;
  bars: MonthBar[];
  paid: HostBill[];
  upcoming: HostBill[];
};

export type WrittenReview = {
  id: string;
  author: string;
  rating: number;
  body: string;
  bodyFr: string;
  createdAt: string;
  centreName: string | null;
};

export type HostInsights = {
  ok: boolean;
  listingRatingX10: number | null;
  listingReviewCount: number | null;
  parentRatingX10: number | null;
  parentReviewCount: number | null;
  reviews: WrittenReview[];
  viewCount: number | null;
  requestCount: number | null;
  tourCount: number | null;
};

const EMPTY_EARNINGS: HostEarnings = {
  ok: false,
  thisMonthCents: null,
  bars: [],
  paid: [],
  upcoming: [],
};

export function emptyHostEarnings(): HostEarnings {
  return { ...EMPTY_EARNINGS, bars: [], paid: [], upcoming: [] };
}

/** Last `count` calendar months, oldest first, ending on `now`. */
export function recentMonthPeriods(now = new Date(), count = 6): string[] {
  const periods: string[] = [];
  const start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    periods.push(currentPeriod(date));
  }
  return periods;
}

function paidMonth(bill: HostBill): string | null {
  if (bill.paidAt) {
    const date = new Date(bill.paidAt);
    if (!Number.isNaN(date.getTime())) return currentPeriod(date);
  }
  const period = String(bill.period || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(period) ? period : null;
}

/** Paid net cents per month. Months with no paid bill are 0, which is the real sum. */
export function paidMonthBars(bills: readonly HostBill[], now = new Date(), count = 6): MonthBar[] {
  const periods = recentMonthPeriods(now, count);
  return periods.map((period) => {
    let cents = 0;
    for (const bill of bills) {
      if (bill.status !== "paid" || !Number.isFinite(bill.netCents)) continue;
      if (paidMonth(bill) !== period) continue;
      cents += Math.round(bill.netCents);
    }
    return { period, cents };
  });
}

export function chartHasEarnings(bars: readonly MonthBar[]): boolean {
  return bars.some((bar) => bar.cents > 0);
}

export function monthTick(period: string, french: boolean): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString(french ? "fr-CA" : "en-CA", { month: "short" });
}

export function shapeHostEarnings(bills: readonly HostBill[], now = new Date()): HostEarnings {
  const monthBills: MonthBill[] = bills.map((bill) => ({
    status: bill.status,
    netCents: bill.netCents,
    paidAt: bill.paidAt,
    period: bill.period,
  }));
  const paid = bills
    .filter((bill) => bill.status === "paid" && Number.isFinite(bill.netCents))
    .slice()
    .sort((a, b) => String(b.paidAt || b.period || "").localeCompare(String(a.paidAt || a.period || "")));
  const upcoming = bills
    .filter((bill) => bill.status === "sent" && Number.isFinite(bill.netCents))
    .slice()
    .sort((a, b) => String(a.dueAt || a.period || "").localeCompare(String(b.dueAt || b.period || "")));
  return {
    ok: true,
    thisMonthCents: earningsThisMonthCents(monthBills, now),
    bars: paidMonthBars(bills, now),
    paid,
    upcoming,
  };
}

export function billLabel(bill: Pick<HostBill, "parentName" | "number">): string | null {
  const name = bill.parentName?.trim();
  if (name) return name;
  const number = bill.number?.trim();
  return number || null;
}

export function parentHeadline(
  reviews: readonly { rating: number }[],
): { ratingX10: number; reviewCount: number } | null {
  const summary = parentReviewSummary(reviews.map((review) => ({ rating: review.rating })));
  if (summary.count < 1 || summary.ratingX10 <= 0) return null;
  return { ratingX10: summary.ratingX10, reviewCount: summary.count };
}

/** The number on the menu card. Listing rating wins when it exists. Parent reviews fill the gap. */
export function insightsCardRating(input: {
  listingRatingX10: number | null;
  listingReviewCount: number | null;
  parentRatingX10: number | null;
  parentReviewCount: number | null;
}): { ratingX10: number; reviewCount: number } | null {
  if (
    typeof input.listingRatingX10 === "number" &&
    input.listingRatingX10 > 0 &&
    typeof input.listingReviewCount === "number" &&
    input.listingReviewCount > 0
  ) {
    return { ratingX10: input.listingRatingX10, reviewCount: input.listingReviewCount };
  }
  if (
    typeof input.parentRatingX10 === "number" &&
    input.parentRatingX10 > 0 &&
    typeof input.parentReviewCount === "number" &&
    input.parentReviewCount > 0
  ) {
    return { ratingX10: input.parentRatingX10, reviewCount: input.parentReviewCount };
  }
  return null;
}
