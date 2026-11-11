/**
 * Which phone stores are open. Flip `live` and set `url` to publish a store.
 * Coming soon tiles have no link. scripts/app-stores.test.mjs loads this file.
 */
import { STORE } from "./store-listing.ts";

export type AppStoreId = "play" | "amazon" | "huawei" | "apple" | "samsung" | "microsoft";

export type AppStoreTile = {
  id: AppStoreId;
  live: boolean;
  /** Download page. Null while the store is coming soon. */
  url: string | null;
  nameEn: string;
  nameFr: string;
};

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${STORE.playPackageName}`;
/** Package link the Amazon helper already accepts. Not a made-up product page. */
export const AMAZON_STORE_URL = `https://www.amazon.com/gp/mas/dl/android?p=${STORE.playPackageName}`;

/**
 * AppGallery Connect has no public app id in this repo, so Huawei stays
 * coming soon until that listing URL is pasted here.
 */
export const APP_STORES: readonly AppStoreTile[] = [
  { id: "play", live: true, url: PLAY_STORE_URL, nameEn: "Google Play", nameFr: "Google Play" },
  { id: "amazon", live: true, url: AMAZON_STORE_URL, nameEn: "Amazon Appstore", nameFr: "Amazon Appstore" },
  { id: "huawei", live: false, url: null, nameEn: "Huawei AppGallery", nameFr: "Huawei AppGallery" },
  { id: "apple", live: false, url: null, nameEn: "App Store", nameFr: "App Store" },
  { id: "samsung", live: false, url: null, nameEn: "Galaxy Store", nameFr: "Galaxy Store" },
  { id: "microsoft", live: false, url: null, nameEn: "Microsoft Store", nameFr: "Microsoft Store" },
];

export const APP_SHARE_PATH = "/app";

export function liveAppStores(stores: readonly AppStoreTile[] = APP_STORES): AppStoreTile[] {
  return stores.filter((store) => store.live && Boolean(store.url));
}

export function appStoreById(id: AppStoreId, stores: readonly AppStoreTile[] = APP_STORES): AppStoreTile | undefined {
  return stores.find((store) => store.id === id);
}

/** One store for this phone, or null when the visitor should see the list. */
export function storeForDevice(userAgent: string | null | undefined, stores: readonly AppStoreTile[] = APP_STORES): AppStoreTile | null {
  const ua = String(userAgent || "");
  const live = (id: AppStoreId) => {
    const store = appStoreById(id, stores);
    return store?.live && store.url ? store : null;
  };
  if (/Huawei|HUAWEI|HarmonyOS|HMSCore/i.test(ua)) return live("huawei");
  if (/Silk|Kindle|KF[A-Z]{2}|AmazonWebView/i.test(ua)) return live("amazon");
  if (/Android/i.test(ua)) return live("play");
  return null;
}

export function appShareUrl(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${APP_SHARE_PATH}`;
}
