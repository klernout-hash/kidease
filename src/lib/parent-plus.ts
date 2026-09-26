/**
 * KidEase Parent Plus (CAD). Not centre SaaS and not family tuition bills.
 */

import { paidPlanPrice, parentUpgradePlan } from "./upgrade-plans.ts";

export const PLUS_INTERVALS = ["month", "year"] as const;
export type PlusInterval = (typeof PLUS_INTERVALS)[number];

export const PLUS_PLAN_IDS = ["free", "plus", "alerts"] as const;
export type PlusPlanId = (typeof PLUS_PLAN_IDS)[number];

const plusPrice = paidPlanPrice("plus");
const alertsPrice = paidPlanPrice("alerts");

export const PLUS_MONTHLY_CAD = plusPrice?.monthlyCad ?? 7.99;
export const PLUS_YEARLY_CAD = plusPrice?.yearlyCad ?? 59;
export const ALERTS_MONTHLY_CAD = alertsPrice?.monthlyCad ?? 14.99;
export const ALERTS_YEARLY_CAD = alertsPrice?.yearlyCad ?? 149;

/** Real Plus gate only. Saved-search alerts and support are not Plus-gated. */
export const PLUS_FEATURES: Array<{ en: string; fr: string }> = parentUpgradePlan("plus").benefits;

export function isPlusInterval(raw: string | null | undefined): raw is PlusInterval {
  return PLUS_INTERVALS.includes((raw || "") as PlusInterval);
}

export function isPlusPlanId(raw: string | null | undefined): raw is PlusPlanId {
  return PLUS_PLAN_IDS.includes((raw || "") as PlusPlanId);
}

export function plusPriceCad(interval: PlusInterval): number {
  return interval === "year" ? PLUS_YEARLY_CAD : PLUS_MONTHLY_CAD;
}

export function parentVideoEntitled(plan: string | null | undefined, status: string | null | undefined): boolean {
  const paid = status === "active" || status === "trialing";
  const id = String(plan || "").trim().toLowerCase();
  return paid && (id === "plus" || id === "alerts");
}

/** SMS and push saved-search alerts. Email alerts stay on Free. */
export function parentAlertsEntitled(plan: string | null | undefined, status: string | null | undefined): boolean {
  const paid = status === "active" || status === "trialing";
  return paid && String(plan || "").trim().toLowerCase() === "alerts";
}

export function plusPriceHint(interval: PlusInterval, locale: "en" | "fr"): string {
  if (interval === "year") return locale === "fr" ? "59 $ / an" : "$59 / year";
  return locale === "fr" ? "7,99 $ / mois" : "$7.99 / month";
}
