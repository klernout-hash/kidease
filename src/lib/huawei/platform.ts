/**
 * AppGallery extras. Each flag defaults off.
 * Alert push does not upload a token and does not send a message.
 * The listing URL is the public AppGallery page Kyle confirmed.
 *
 * No @/ imports. scripts/huawei-platform.test.mjs loads this file in Node.
 */

import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";

export const HUAWEI_ALERT_PUSH_FLAG = "FEATURE_HUAWEI_ALERT_PUSH";
export const HUAWEI_APP_LINKING_FLAG = "FEATURE_HUAWEI_APP_LINKING";
export const HUAWEI_REVIEW_FLAG = "FEATURE_HUAWEI_IN_APP_REVIEW";
export const HUAWEI_GALLERY_FLAG = "FEATURE_HUAWEI_APPGALLERY_LINK";

/** Public AppGallery listing for KidEase. Confirmed by Kyle. */
export const HUAWEI_APPGALLERY_URL = "https://appgallery.huawei.com/#/app/C119648761";
export const HUAWEI_APP_ID = "C119648761";

export type HuaweiPlatformMarks = {
  huaweiAlertPush?: true;
  huaweiAppLinking?: true;
  huaweiReview?: true;
  huaweiGallery?: true;
};

const SITE_HOSTS = new Set(["www.kidease.ca", "kidease.ca"]);

function on(
  env: EnvMap | undefined,
  key: typeof HUAWEI_ALERT_PUSH_FLAG | typeof HUAWEI_APP_LINKING_FLAG | typeof HUAWEI_REVIEW_FLAG | typeof HUAWEI_GALLERY_FLAG,
): boolean {
  return evaluateFeatureFlag(key, env);
}

export function huaweiPlatformContext(env?: EnvMap): HuaweiPlatformMarks {
  const out: HuaweiPlatformMarks = {};
  if (on(env, HUAWEI_ALERT_PUSH_FLAG)) out.huaweiAlertPush = true;
  if (on(env, HUAWEI_APP_LINKING_FLAG)) out.huaweiAppLinking = true;
  if (on(env, HUAWEI_REVIEW_FLAG)) out.huaweiReview = true;
  if (on(env, HUAWEI_GALLERY_FLAG)) out.huaweiGallery = true;
  return out;
}

/** Review page. Null while the flag is off. No Play review sheet. */
export function huaweiReviewUrl(flagOn: boolean): string | null {
  if (!flagOn) return null;
  return HUAWEI_APPGALLERY_URL;
}

/** Get the app listing. Null while the flag is off. */
export function huaweiGalleryUrl(flagOn: boolean): string | null {
  if (!flagOn) return null;
  return HUAWEI_APPGALLERY_URL;
}

/**
 * In-app path for an App Linking URL. Null while the flag is off, and null
 * for any host that is not KidEase or this AppGallery app id.
 */
export function huaweiAppLinkPath(flagOn: boolean, raw: string | null | undefined): string | null {
  if (!flagOn) return null;
  let url: URL;
  try {
    url = new URL(String(raw || ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.hostname === "appgallery.huawei.com") {
    const id = url.hash.startsWith("#/app/") ? url.hash.slice("#/app/".length) : url.pathname.replace(/^\/app\//, "");
    return id.split(/[/?#]/)[0] === HUAWEI_APP_ID ? "/get-app" : null;
  }
  if (!SITE_HOSTS.has(url.hostname)) return null;
  const path = `${url.pathname || "/"}${url.search}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}
