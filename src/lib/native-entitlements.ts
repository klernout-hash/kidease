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

/** Android flavour tokens. iOS ignores them. Microsoft is a website package, not a native token. */
export const STORE_UA_SAMSUNG = "KidEaseStoreSamsung";
export const STORE_UA_HUAWEI = "KidEaseStoreHuawei";
export const STORE_UA_MICROSOFT = "KidEaseStoreMicrosoft";

export type StoreChannel = "web" | "apple" | "google" | "samsung" | "huawei" | "microsoft";

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

const STORE_CHANNELS: readonly StoreChannel[] = ["web", "apple", "google", "samsung", "huawei", "microsoft"];

export function isStoreChannel(value: string | null | undefined): value is StoreChannel {
  return STORE_CHANNELS.includes(value as StoreChannel);
}

function searchParams(search: string | null | undefined): URLSearchParams {
  const raw = String(search || "").replace(/^\?/, "");
  return new URLSearchParams(raw);
}

function cookieHasMicrosoft(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)ke_store=microsoft(?:;|$)/.test(String(cookie || ""));
}

/**
 * User-agent string a store binary may send.
 * Only the Samsung flavour may include KidEaseStoreSamsung.
 * Only the Huawei flavour may include KidEaseStoreHuawei.
 * iOS and Play drop both, even if a shared config still has them.
 */
export function userAgentForStoreBuild(
  flavor: string | null | undefined,
  base: string | null | undefined,
  configured: string | null | undefined,
): string {
  let next = String(base || "");
  if (flavor !== "samsung") next = next.replaceAll(STORE_UA_SAMSUNG, "");
  if (flavor !== "huawei") next = next.replaceAll(STORE_UA_HUAWEI, "");
  next = next.replace(/\s+/g, " ").trim();
  const token =
    flavor === "samsung" && configured === STORE_UA_SAMSUNG
      ? STORE_UA_SAMSUNG
      : flavor === "huawei" && configured === STORE_UA_HUAWEI
        ? STORE_UA_HUAWEI
        : "";
  if (!token) return next;
  if (!next) return token;
  if (next.includes(token)) return next;
  return `${next} ${token}`;
}

/** Drop a Samsung store link. iOS and Play must not open with ?store=samsung. */
export function withoutSamsungStoreQuery(url: string | null | undefined): string {
  const raw = String(url || "");
  if (!raw.includes("store=samsung")) return raw;
  return raw
    .replace("?store=samsung&", "?")
    .replace("&store=samsung&", "&")
    .replace("?store=samsung", "")
    .replace("&store=samsung", "");
}

/**
 * Which store wrapped this page.
 * Samsung and Microsoft keep Stripe. Apple, Google Play, and Huawei do not.
 * KidEaseNative (iOS and Play) wins over ?store=microsoft, ?store=samsung, and the ke_store cookie.
 * The Samsung token applies only when it is on the user agent and the device is not iOS.
 * A home-screen install of the website is "web", not Microsoft.
 */
export function storeChannelFromSignals(input: {
  userAgent?: string | null;
  search?: string | null;
  cookie?: string | null;
}): StoreChannel {
  const ua = String(input.userAgent || "");
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios && ua.includes(NATIVE_UA_TOKEN)) return "apple";
  if (!ios && ua.includes(STORE_UA_HUAWEI)) return "huawei";
  if (!ios && ua.includes(STORE_UA_SAMSUNG)) return "samsung";
  if (ua.includes(NATIVE_UA_TOKEN)) return "google";
  if (ua.includes(STORE_UA_MICROSOFT)) return "microsoft";
  const store = searchParams(input.search).get("store");
  if (store === "microsoft" || cookieHasMicrosoft(input.cookie)) return "microsoft";
  return "web";
}

/** Apple, Google Play, and Huawei hide in-app Stripe. Samsung and Microsoft do not. */
export function shellBlocksCommerce(channel: StoreChannel): boolean {
  return channel === "apple" || channel === "google" || channel === "huawei";
}

export function commercePolicyForChannel(channel: StoreChannel): NativeCommercePolicy {
  return shellBlocksCommerce(channel) ? NATIVE_V1 : WEBSITE;
}

/** Huawei phones have no Google Play Services. Play and Samsung builds keep Google. */
export function googleServicesHidden(channel: StoreChannel): boolean {
  return channel === "huawei";
}

export function readClientStoreChannel(): StoreChannel {
  if (typeof navigator === "undefined") return "web";
  const search = typeof location !== "undefined" ? location.search : "";
  const cookie = typeof document !== "undefined" ? document.cookie : "";
  return storeChannelFromSignals({
    userAgent: navigator.userAgent,
    search,
    cookie,
  });
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
