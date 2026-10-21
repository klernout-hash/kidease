/**
 * Native shell commerce for v1.
 *
 * The iOS and Android apps load https://www.kidease.ca. Digital goods
 * (Parent Plus, Parent Alerts, centre plans, upgrades, Stripe Checkout)
 * are not sold in that shell. The website keeps its own screens.
 *
 * Daycare tools already bought on kidease.ca still unlock after sign-in.
 * That decision stays in provider-entitlements.ts. This module never
 * downgrades a paid centre.
 *
 * v1.1 slot: Parent Plus only, through Apple In-App Purchase or Google
 * Play Billing. parentPlusIap stays null until that ships.
 */

export const NATIVE_UA_TOKEN = "KidEaseNative";

export type ParentPlusIapStore = "apple" | "google";

export type NativeCommercePolicy = {
  version: 1;
  /** False inside the native shell. The website is unchanged. */
  sellDigitalGoods: boolean;
  showParentPlus: boolean;
  showParentAlerts: boolean;
  showPrices: boolean;
  showUpgrade: boolean;
  showCheckout: boolean;
  showStripeLinks: boolean;
  /** "Subscribe on our website" is steering under Apple 3.1.1. */
  showSubscribeOnWeb: boolean;
  /** Purchased centre tools stay available after sign-in. */
  daycarePurchasesUnlock: true;
  /** v1.1. Null means Parent Plus is not an in-app purchase yet. */
  parentPlusIap: ParentPlusIapStore | null;
};

const WEBSITE: NativeCommercePolicy = {
  version: 1,
  sellDigitalGoods: true,
  showParentPlus: true,
  showParentAlerts: true,
  showPrices: true,
  showUpgrade: true,
  showCheckout: true,
  showStripeLinks: true,
  showSubscribeOnWeb: true,
  daycarePurchasesUnlock: true,
  parentPlusIap: null,
};

const NATIVE_V1: NativeCommercePolicy = {
  version: 1,
  sellDigitalGoods: false,
  showParentPlus: false,
  showParentAlerts: false,
  showPrices: false,
  showUpgrade: false,
  showCheckout: false,
  showStripeLinks: false,
  showSubscribeOnWeb: false,
  daycarePurchasesUnlock: true,
  parentPlusIap: null,
};

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return String(userAgent || "").includes(NATIVE_UA_TOKEN);
}

export function nativeCommercePolicy(native: boolean): NativeCommercePolicy {
  return native ? NATIVE_V1 : WEBSITE;
}

export function nativeBlocksCheckout(native: boolean): boolean {
  return !nativeCommercePolicy(native).showCheckout;
}

/** Parent Alerts is omitted from the native shell, not merely flagged off. */
export function plansVisibleInShell<T extends { id: string }>(plans: readonly T[], native: boolean): T[] {
  if (!native) return [...plans];
  return plans.filter((plan) => plan.id !== "alerts" && plan.id !== "plus");
}

export const NATIVE_COMMERCE_SELECTORS = [
  "[data-ke='digital-plan']",
  ".ke-digital-plan",
  ".ke-digital-plan-slot",
  "[data-nav='upgrade']",
  "[data-nav='plans']",
  "[data-nav='promote']",
  "[data-ke='plan-checkout']",
  "[data-ke='native-checkout']",
  "a[href*='checkout.stripe.com']",
  "a[href*='billing.stripe.com']",
].join(",");
