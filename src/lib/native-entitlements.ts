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
export const STORE_UA_AMAZON = "KidEaseStoreAmazon";
export const STORE_UA_MICROSOFT = "KidEaseStoreMicrosoft";
/** Play or Galaxy Store build on a phone with no Google Play services. */
export const NO_GMS_UA_TOKEN = "KidEaseNoGms";

export type StoreChannel = "web" | "apple" | "google" | "samsung" | "huawei" | "amazon" | "microsoft";

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

const STORE_CHANNELS: readonly StoreChannel[] = ["web", "apple", "google", "samsung", "huawei", "amazon", "microsoft"];

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
 * Cookie for a Microsoft Store launch (`?store=microsoft`).
 * iOS and Play (`KidEaseNative`) never receive it, so the cookie cannot turn
 * those shells into the website channel. Secure is included for https.
 */
export function microsoftStoreCookieHeader(
  input: { userAgent?: string | null; search?: string | null },
  options?: { secure?: boolean },
): string | null {
  if (String(input.userAgent || "").includes(NATIVE_UA_TOKEN)) return null;
  if (searchParams(input.search).get("store") !== "microsoft") return null;
  const secure = options?.secure !== false;
  return `ke_store=microsoft; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * User-agent string a store binary may send.
 * Only the Samsung flavour may include KidEaseStoreSamsung.
 * Only the Huawei flavour may include KidEaseStoreHuawei.
 * Only the Amazon flavour may include KidEaseStoreAmazon.
 * iOS and Play drop the others, even if a shared config still has them.
 */
export function userAgentForStoreBuild(
  flavor: string | null | undefined,
  base: string | null | undefined,
  configured: string | null | undefined,
): string {
  let next = String(base || "");
  if (flavor !== "samsung") next = next.replaceAll(STORE_UA_SAMSUNG, "");
  if (flavor !== "huawei") next = next.replaceAll(STORE_UA_HUAWEI, "");
  if (flavor !== "amazon") next = next.replaceAll(STORE_UA_AMAZON, "");
  next = next.replace(/\s+/g, " ").trim();
  const token =
    flavor === "samsung" && configured === STORE_UA_SAMSUNG
      ? STORE_UA_SAMSUNG
      : flavor === "huawei" && configured === STORE_UA_HUAWEI
        ? STORE_UA_HUAWEI
        : flavor === "amazon" && configured === STORE_UA_AMAZON
          ? STORE_UA_AMAZON
          : "";
  if (!token) return next;
  if (!next) return token;
  if (next.includes(token)) return next;
  return `${next} ${token}`;
}

/** Hide Google sign-in when this WebView already learned Play services are missing. */
export function userAgentWithPlayServices(agent: string | null | undefined, available: boolean): string {
  const next = String(agent || "")
    .replaceAll(NO_GMS_UA_TOKEN, "")
    .replace(/\s+/g, " ")
    .trim();
  if (available) return next;
  if (!next) return NO_GMS_UA_TOKEN;
  return `${next} ${NO_GMS_UA_TOKEN}`;
}

export function googlePlayServicesAvailable(userAgent: string | null | undefined): boolean {
  return !String(userAgent || "").includes(NO_GMS_UA_TOKEN);
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
 * KidEaseNative (iOS and Play) wins over ?store=microsoft, ?store=samsung, and the ke_store cookie.
 * The Samsung token applies only when it is on the user agent and the device is not iOS.
 * A home-screen install of the website is "web", not Microsoft.
 *
 * v1 payments are off in every store. See STORE_PAYMENTS_ENABLED.
 */
function viteStoreChannel(): string | null {
  try {
    const value = import.meta.env?.VITE_STORE_CHANNEL;
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || null;
  } catch {
    return null;
  }
}

/** `play` and `ios` are build names. The site still stores `google` and `apple`. */
export function storeChannelFromBuild(raw: string | null | undefined): StoreChannel | null {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "play") return "google";
  if (value === "ios") return "apple";
  if (isStoreChannel(value)) return value;
  return null;
}

export function storeChannelFromSignals(input: {
  userAgent?: string | null;
  search?: string | null;
  cookie?: string | null;
  /** VITE_STORE_CHANNEL. Used only when the user agent did not already name a store. */
  buildChannel?: string | null;
}): StoreChannel {
  const ua = String(input.userAgent || "");
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios && ua.includes(NATIVE_UA_TOKEN)) return "apple";
  if (!ios && ua.includes(STORE_UA_HUAWEI)) return "huawei";
  if (!ios && ua.includes(STORE_UA_AMAZON)) return "amazon";
  if (!ios && ua.includes(STORE_UA_SAMSUNG)) return "samsung";
  if (ua.includes(NATIVE_UA_TOKEN)) return "google";
  if (ua.includes(STORE_UA_MICROSOFT)) return "microsoft";
  const store = searchParams(input.search).get("store");
  if (store === "microsoft" || cookieHasMicrosoft(input.cookie)) return "microsoft";
  const built = storeChannelFromBuild(
    input.buildChannel !== undefined ? input.buildChannel : viteStoreChannel(),
  );
  if (built && built !== "web") return built;
  return "web";
}

/**
 * v1: payments stay off in every store app until that store has approved the app.
 * v2 turns one store back on by flipping its entry to true. A normal browser (`web`) is not in this list and always keeps checkout.
 */
export const STORE_PAYMENTS_ENABLED: Record<Exclude<StoreChannel, "web">, boolean> = {
  apple: false,
  google: false,
  microsoft: false,
  samsung: false,
  huawei: false,
  amazon: false,
};

export function storePaymentsEnabled(channel: StoreChannel): boolean {
  if (channel === "web") return true;
  return STORE_PAYMENTS_ENABLED[channel];
}

/** True when this store must hide prices, Stripe, and upgrade buttons. */
export function shellBlocksCommerce(channel: StoreChannel): boolean {
  return !storePaymentsEnabled(channel);
}

/**
 * Apple 2.3.10: a store build names only its own store, or none.
 * The website still says both apps are coming soon.
 */
export function comingSoonStores(channel: StoreChannel): Array<"apple" | "play"> {
  if (channel === "apple") return ["apple"];
  if (channel === "google") return ["play"];
  if (channel === "web") return ["apple", "play"];
  return [];
}

export function commercePolicyForChannel(channel: StoreChannel): NativeCommercePolicy {
  return shellBlocksCommerce(channel) ? NATIVE_V1 : WEBSITE;
}

/** AppGallery and Amazon Fire builds have no Google Play services. */
export function googleServicesHidden(channel: StoreChannel): boolean {
  return channel === "huawei" || channel === "amazon";
}

export function readClientStoreChannel(): StoreChannel {
  if (typeof navigator === "undefined") return storeChannelFromSignals({});
  const search = typeof location !== "undefined" ? location.search : "";
  const cookie = typeof document !== "undefined" ? document.cookie : "";
  return storeChannelFromSignals({
    userAgent: navigator.userAgent,
    search,
    cookie,
  });
}

/** True unless this WebView's user agent says Play services are missing. */
export function readClientPlayServices(): boolean {
  if (typeof navigator === "undefined") return true;
  return googlePlayServicesAvailable(navigator.userAgent);
}

/**
 * Store apps never show plan cards, even when SUBSCRIPTIONS_ENABLED is on.
 * A centre plan already bought on the website still unlocks in provider-entitlements.
 */
export function plansVisibleInShell<T extends { id: string }>(plans: readonly T[], native: boolean): T[] {
  if (native) return [];
  return [...plans];
}

/** Paid plan pages and prices stay on the website. Every store channel is closed. */
export function plansOpenInShell(input: { subscriptionsOn: boolean; channel: StoreChannel }): boolean {
  return input.subscriptionsOn && input.channel === "web";
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
