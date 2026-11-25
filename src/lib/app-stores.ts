/**
 * Which phone stores are open. Availability and a verified download URL are separate.
 * A store without a URL has no link. scripts/app-stores.test.mjs loads this file.
 */
import { isAmazonDevice } from "./amazon-appstore.ts";
import { STORE } from "./store-listing.ts";

export type AppStoreId = "play" | "amazon" | "huawei" | "apple" | "samsung" | "microsoft";

export type AppStoreTile = {
  id: AppStoreId;
  live: boolean;
  /** Verified download page. Null until its exact listing URL is known. */
  url: string | null;
  nameEn: string;
  nameFr: string;
};

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${STORE.playPackageName}`;
/** Package link the Amazon helper already accepts. Not a made-up product page. */
export const AMAZON_STORE_URL = `https://www.amazon.com/gp/mas/dl/android?p=${STORE.playPackageName}`;

/** Kyle confirmed this AppGallery listing on 16 Nov 2026. */
export const HUAWEI_STORE_URL = "https://appgallery.huawei.com/#/app/C119648761";

export const APP_STORES: readonly AppStoreTile[] = [
  { id: "play", live: true, url: PLAY_STORE_URL, nameEn: "Google Play", nameFr: "Google Play" },
  { id: "amazon", live: true, url: AMAZON_STORE_URL, nameEn: "Amazon Appstore", nameFr: "Amazon Appstore" },
  { id: "huawei", live: true, url: HUAWEI_STORE_URL, nameEn: "Huawei AppGallery", nameFr: "Huawei AppGallery" },
  { id: "apple", live: false, url: null, nameEn: "App Store", nameFr: "App Store" },
  { id: "samsung", live: false, url: null, nameEn: "Galaxy Store", nameFr: "Galaxy Store" },
  { id: "microsoft", live: false, url: null, nameEn: "Microsoft Store", nameFr: "Microsoft Store" },
];

export const APP_SHARE_PATH = "/app";

function storeList(names: string[]): string {
  return names.join(", ");
}

/**
 * One sentence for JSON-LD and page descriptions.
 * Live and not-live come from APP_STORES, the same list the download tiles use.
 */
export function appAvailabilitySentence(locale: "en" | "fr" = "en", stores: readonly AppStoreTile[] = APP_STORES): string {
  const live = stores.filter((store) => store.live).map((store) => (locale === "fr" ? store.nameFr : store.nameEn));
  const waiting = stores.filter((store) => !store.live).map((store) => (locale === "fr" ? store.nameFr : store.nameEn));
  if (locale === "fr") {
    return `Recherche gratuite de garderies permises au Canada. Offert : ${storeList(live)}. Pas encore offert : ${storeList(waiting)}.`;
  }
  return `Free search for licensed Canadian child care listings. Monthly fees, open spots, and enrolment. Available: ${storeList(live)}. Not available yet: ${storeList(waiting)}.`;
}

export function liveAppStores(stores: readonly AppStoreTile[] = APP_STORES): AppStoreTile[] {
  return stores.filter((store) => store.live && Boolean(store.url));
}

export function appStoreById(id: AppStoreId, stores: readonly AppStoreTile[] = APP_STORES): AppStoreTile | undefined {
  return stores.find((store) => store.id === id);
}

/**
 * One store for this phone, or null when the visitor should see the list.
 * Android defaults to Google Play. Amazon only on Fire / Silk / KF devices or
 * with the ke_store=amazon cookie.
 */
export function storeForDevice(
  userAgent: string | null | undefined,
  stores: readonly AppStoreTile[] = APP_STORES,
  cookie: string | null = null,
): AppStoreTile | null {
  const ua = String(userAgent || "");
  const live = (id: AppStoreId) => {
    const store = appStoreById(id, stores);
    return store?.live && store.url ? store : null;
  };
  if (/Huawei|HUAWEI|HarmonyOS|HMSCore/i.test(ua)) return live("huawei");
  if (isAmazonDevice(ua, cookie)) return live("amazon") ?? live("play");
  if (/Android/i.test(ua)) return live("play");
  return null;
}

export function appShareUrl(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${APP_SHARE_PATH}`;
}

/**
 * Get-app kicker and title suffix from APP_STORES, so the page never claims a
 * platform whose store still says "Download unavailable".
 */
export function appPlatformsLabel(locale: "en" | "fr" = "en", stores: readonly AppStoreTile[] = APP_STORES): string {
  const live = (id: AppStoreId) => Boolean(appStoreById(id, stores)?.live && appStoreById(id, stores)?.url);
  const android = live("play") || live("amazon") || live("huawei") || live("samsung");
  const parts: string[] = [];
  if (locale === "fr") {
    if (live("apple")) parts.push("iPhone et iPad");
    if (android) parts.push(parts.length ? "téléphones et tablettes Android" : "Téléphones et tablettes Android");
    if (live("microsoft")) parts.push("Windows");
    parts.push(parts.length ? "navigateur Web" : "Navigateur Web");
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}` : parts[0]!;
  }
  if (live("apple")) parts.push("iPhone and iPad");
  if (android) parts.push("Android phones and tablets");
  if (live("microsoft")) parts.push("Windows");
  parts.push(parts.length ? "the web" : "The web");
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} and ${parts[parts.length - 1]}` : parts[0]!;
}

/** Store links outside the tiles (Galaxy, Microsoft) render only for a live listing. */
export function storeLinkAllowed(id: AppStoreId, stores: readonly AppStoreTile[] = APP_STORES): boolean {
  const store = appStoreById(id, stores);
  return Boolean(store?.live);
}
