/**
 * Galaxy Store deep link and a push fallback for phones without Play services.
 * Both stay off unless their own flag is on. FCM on a Galaxy phone with Play
 * services is unchanged.
 *
 * No @/ imports. scripts/samsung-platform.test.mjs loads this file in Node.
 */

import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";
import { STORE } from "../store-listing.ts";

export const SAMSUNG_STORE_FLAG = "FEATURE_SAMSUNG_STORE_LINK";
export const SAMSUNG_PUSH_FLAG = "FEATURE_SAMSUNG_PUSH_FALLBACK";

export const SAMSUNG_PUSH_FALLBACK_MESSAGE =
  "Phone alerts need Google Play services on this phone. KidEase still keeps notices in the app.";

export type SamsungPlatformMarks = {
  samsungStore?: true;
  samsungPush?: true;
};

export function galaxyStoreHttps(pkg = STORE.playPackageName): string {
  return `https://galaxystore.samsung.com/detail/${encodeURIComponent(pkg)}`;
}

export function galaxyStoreDeepLink(pkg = STORE.playPackageName): string {
  return `samsungapps://ProductDetail/${pkg}`;
}

export function samsungPlatformContext(env?: EnvMap): SamsungPlatformMarks {
  const out: SamsungPlatformMarks = {};
  if (evaluateFeatureFlag(SAMSUNG_STORE_FLAG, env)) out.samsungStore = true;
  if (evaluateFeatureFlag(SAMSUNG_PUSH_FLAG, env)) out.samsungPush = true;
  return out;
}

/** Null while FEATURE_SAMSUNG_STORE_LINK is off. */
export function samsungStoreLinks(flagOn: boolean, pkg = STORE.playPackageName): { https: string; deep: string } | null {
  if (!flagOn) return null;
  return { https: galaxyStoreHttps(pkg), deep: galaxyStoreDeepLink(pkg) };
}

/**
 * unchanged: keep today's FCM path.
 * skip: Galaxy Store build, flag on, and Play services are missing. Do not call FCM.
 */
export function samsungPushFallback(
  flagOn: boolean,
  channel: string,
  playServices: boolean,
): "unchanged" | "skip" {
  if (!flagOn || channel !== "samsung" || playServices) return "unchanged";
  return "skip";
}
