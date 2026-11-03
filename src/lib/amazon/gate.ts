/**
 * Amazon-only features (ADM push, Login with Amazon, Fire kiosk) show ONLY in
 * the Amazon Appstore build running on an Amazon device. Both must be true:
 *
 *  1. Build flavour: the WebView user agent carries KidEaseStoreAmazon. Only the
 *     `amazon` Gradle product flavour writes it (MainActivity strips it from every
 *     other flavour; userAgentForStoreBuild mirrors that).
 *  2. Device: the native shell adds KidEaseAmazonDevice only when
 *     Build.MANUFACTURER is "Amazon" (Fire OS). A Fire model string in the UA
 *     (KF*, AFT*) is NOT enough on its own.
 *
 * Never on iOS, Play, Samsung, Huawei, Microsoft, or the website (including Silk).
 * No @/ imports, so scripts/amazon-features.test.mjs loads this file in Node.
 */

export const STORE_UA_AMAZON_TOKEN = "KidEaseStoreAmazon";
export const AMAZON_DEVICE_UA_TOKEN = "KidEaseAmazonDevice";
export const NATIVE_TOKEN = "KidEaseNative";

const OTHER_STORE_TOKENS = ["KidEaseStoreSamsung", "KidEaseStoreHuawei", "KidEaseStoreMicrosoft"];

export type AmazonGateSignals = {
  userAgent?: string | null;
};

/** Amazon Appstore build (amazon flavour) on a device whose manufacturer is Amazon. */
export function amazonBuildOnAmazonDevice(signals: AmazonGateSignals): boolean {
  const ua = String(signals.userAgent || "");
  if (!ua) return false;
  if (/iPhone|iPad|iPod|Macintosh|Windows NT/i.test(ua)) return false;
  if (!ua.includes(NATIVE_TOKEN)) return false;
  if (!ua.includes(STORE_UA_AMAZON_TOKEN)) return false;
  if (!ua.includes(AMAZON_DEVICE_UA_TOKEN)) return false;
  if (OTHER_STORE_TOKENS.some((token) => ua.includes(token))) return false;
  return true;
}

function flagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

type Env = Record<string, string | undefined>;

/** Login with Amazon button: FEATURE_LOGIN_AMAZON + LWA keys + Amazon build on Amazon device. */
export function loginWithAmazonAllowed(env: Env, signals: AmazonGateSignals): boolean {
  return (
    flagOn(env.FEATURE_LOGIN_AMAZON) &&
    Boolean(env.AMAZON_CLIENT_ID?.trim() && env.AMAZON_CLIENT_SECRET?.trim()) &&
    amazonBuildOnAmazonDevice(signals)
  );
}

/** ADM token registration: FEATURE_PUSH + FEATURE_AMAZON_ADM + Amazon build on Amazon device. */
export function admRegistrationAllowed(env: Env, signals: AmazonGateSignals): boolean {
  return flagOn(env.FEATURE_PUSH) && flagOn(env.FEATURE_AMAZON_ADM) && amazonBuildOnAmazonDevice(signals);
}

/** Fire kiosk: FEATURE_FIRE_KIOSK + FEATURE_CHILD_CHECKIN + Amazon build on Amazon device. */
export function fireKioskAllowed(env: Env, signals: AmazonGateSignals): boolean {
  return flagOn(env.FEATURE_FIRE_KIOSK) && flagOn(env.FEATURE_CHILD_CHECKIN) && amazonBuildOnAmazonDevice(signals);
}
