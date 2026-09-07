/**
 * Daycare SaaS entitlements (Free / Pro / Network).
 *
 * Paid status never changes quality score or Guest Favorites.
 * Listing, vacancy, claim, and licence stay on Free — never paywalled.
 *
 * When Stripe is live: Pro/Network need selected_plan plus active/trialing.
 * When Stripe is not live: paid extras fail closed (honest billing-not-live).
 * A rehearsal pick on the profile is not a paid subscription.
 */

import {
  isProviderPlanId,
  parseProviderAddons,
  type ProviderAddonId,
  type ProviderPlanId,
} from "@/lib/provider-plans";

export const FREE_INQUIRY_CAP = 10;
export const FREE_ANALYTICS_DAYS = 7;
export const PRO_ANALYTICS_DAYS = 90;

export const PAID_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type ProviderPaidFeature =
  | "unlimited_inquiries"
  | "featured_city"
  | "analytics_90d"
  | "org_dashboard";

export type ProviderEntitlementReason =
  | "ok"
  | "plan_required"
  | "plan_required_billing_not_live";

export type ProviderEntitlementGate = { ok: true } | { ok: false; reason: ProviderEntitlementReason };

export type ProviderEntitlementInput = {
  plan?: string | null;
  status?: string | null;
  addons?: readonly string[] | string | null;
  stripeLive: boolean;
};

export type ProviderEntitlements = {
  selectedPlan: ProviderPlanId;
  entitledPlan: ProviderPlanId;
  stripeLive: boolean;
  paid: boolean;
  unlimitedInquiries: boolean;
  featuredCity: boolean;
  analyticsDays: number;
  orgDashboard: boolean;
  inquiryCap: number | null;
};

export const PROVIDER_PLAN_REQUIRED_MESSAGE =
  "Pro or Network is required for this centre tool. Upgrade from Subscription.";

export const PROVIDER_PLAN_BILLING_NOT_LIVE_MESSAGE =
  "Pro / Network extras stay off until KidEase turns on live card payments. Listing, vacancy, claim, and licence stay free. Nothing will be charged.";

export const PROVIDER_INQUIRY_CAP_MESSAGE =
  "This centre is on Free (10 new messages and tours / month). Upgrade to Pro for unlimited inquiries.";

export const PROVIDER_INQUIRY_CAP_BILLING_NOT_LIVE_MESSAGE =
  "This centre is on Free (10 new messages and tours / month). Unlimited inquiries need Pro when live checkout is on.";

export function isPaidSubscriptionStatus(raw: string | null | undefined): boolean {
  const status = String(raw || "")
    .trim()
    .toLowerCase();
  return (PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function normalizeProviderAddons(raw: readonly string[] | string | null | undefined): ProviderAddonId[] {
  if (Array.isArray(raw)) return parseProviderAddons(raw.join(","));
  return parseProviderAddons(raw);
}

/**
 * Effective paid plan. Rehearsal picks and canceled subs resolve to Free.
 */
export function entitledProviderPlan(input: ProviderEntitlementInput): ProviderPlanId {
  const selected = isProviderPlanId(input.plan) ? input.plan : "free";
  if (selected === "free") return "free";
  if (!input.stripeLive) return "free";
  if (!isPaidSubscriptionStatus(input.status)) return "free";
  return selected;
}

export function resolveProviderEntitlements(input: ProviderEntitlementInput): ProviderEntitlements {
  const selectedPlan = isProviderPlanId(input.plan) ? input.plan : "free";
  const entitledPlan = entitledProviderPlan(input);
  const addons = normalizeProviderAddons(input.addons);
  const paid = entitledPlan === "pro" || entitledPlan === "network";
  const featuredFromAddon = addons.includes("featured_city") && input.stripeLive;
  return {
    selectedPlan,
    entitledPlan,
    stripeLive: Boolean(input.stripeLive),
    paid,
    unlimitedInquiries: paid,
    featuredCity: entitledPlan === "pro" || featuredFromAddon,
    analyticsDays: paid ? PRO_ANALYTICS_DAYS : FREE_ANALYTICS_DAYS,
    orgDashboard: entitledPlan === "network",
    inquiryCap: paid ? null : FREE_INQUIRY_CAP,
  };
}

export function providerFeatureGate(
  feature: ProviderPaidFeature,
  entitlements: ProviderEntitlements,
): ProviderEntitlementGate {
  const entitled =
    feature === "unlimited_inquiries"
      ? entitlements.unlimitedInquiries
      : feature === "featured_city"
        ? entitlements.featuredCity
        : feature === "analytics_90d"
          ? entitlements.analyticsDays >= PRO_ANALYTICS_DAYS
          : entitlements.orgDashboard;
  if (entitled) return { ok: true };
  if (!entitlements.stripeLive) return { ok: false, reason: "plan_required_billing_not_live" };
  return { ok: false, reason: "plan_required" };
}

export function providerFeatureCopy(reason: ProviderEntitlementReason | null | undefined): string {
  if (reason === "plan_required_billing_not_live") return PROVIDER_PLAN_BILLING_NOT_LIVE_MESSAGE;
  if (reason === "plan_required") return PROVIDER_PLAN_REQUIRED_MESSAGE;
  return "";
}

export function inquiryCapCopy(stripeLive: boolean): string {
  return stripeLive ? PROVIDER_INQUIRY_CAP_MESSAGE : PROVIDER_INQUIRY_CAP_BILLING_NOT_LIVE_MESSAGE;
}

export function inquiryRemaining(used: number, cap: number | null): number | null {
  if (cap == null) return null;
  return Math.max(0, cap - Math.max(0, Math.floor(used)));
}

export function inquiryAtCap(used: number, cap: number | null): boolean {
  if (cap == null) return false;
  return Math.max(0, Math.floor(used)) >= cap;
}

/** Placement pin only. Never feed this into qualityBreakdown or Guest Favorites. */
export function sortFeaturedCityAfterPriority<
  T extends { priority?: boolean; featuredCity?: boolean; live?: boolean },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.priority) !== Boolean(b.priority)) return a.priority ? -1 : 1;
    if (Boolean(a.featuredCity) !== Boolean(b.featuredCity)) return a.featuredCity ? -1 : 1;
    if (Boolean(a.live) !== Boolean(b.live)) return a.live ? -1 : 1;
    return 0;
  });
}
