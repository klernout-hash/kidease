/**
 * Huawei ID and Login with Amazon stay off until Kyle sets the keys and
 * flips the flag. Same pattern as Sign in with Apple. Not PostHog flags.
 * This file does not import node:crypto, so the login loader can use it.
 *
 * Server env only. Never commit a real app id, secret, or API key.
 */

export const HUAWEI_SIGNIN_FLAG = "FEATURE_SIGNIN_HUAWEI";
export const AMAZON_SIGNIN_FLAG = "FEATURE_SIGNIN_AMAZON";

type StoreSignInEnv = {
  FEATURE_SIGNIN_HUAWEI?: string;
  FEATURE_SIGNIN_AMAZON?: string;
  HUAWEI_APP_ID?: string;
  HUAWEI_APP_SECRET?: string;
  HUAWEI_CLIENT_ID?: string;
  HUAWEI_CLIENT_SECRET?: string;
  AMAZON_CLIENT_ID?: string;
  AMAZON_CLIENT_SECRET?: string;
  AMAZON_API_KEY?: string;
};

function flagOn(raw: string | undefined | null): boolean {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function trimmed(raw: string | undefined | null): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

/** HMS app id. HUAWEI_CLIENT_ID is the same value under the OAuth name. */
export function huaweiAppId(env: StoreSignInEnv = process.env): string | undefined {
  return trimmed(env.HUAWEI_APP_ID) || trimmed(env.HUAWEI_CLIENT_ID);
}

/** HMS app secret. HUAWEI_CLIENT_SECRET is the same value under the OAuth name. */
export function huaweiAppSecret(env: StoreSignInEnv = process.env): string | undefined {
  return trimmed(env.HUAWEI_APP_SECRET) || trimmed(env.HUAWEI_CLIENT_SECRET);
}

export function amazonClientId(env: StoreSignInEnv = process.env): string | undefined {
  return trimmed(env.AMAZON_CLIENT_ID);
}

export function amazonClientSecret(env: StoreSignInEnv = process.env): string | undefined {
  return trimmed(env.AMAZON_CLIENT_SECRET);
}

/**
 * Login with Amazon API key for the Fire security profile.
 * The website exchange uses the client id and secret. The key stays in env
 * for the owner to register. It is not sent to the browser.
 */
export function amazonApiKey(env: StoreSignInEnv = process.env): string | undefined {
  return trimmed(env.AMAZON_API_KEY);
}

/** Button and Better Auth provider. Default off. */
export function huaweiSignInVisible(env: StoreSignInEnv = process.env): boolean {
  return Boolean(huaweiAppId(env) && huaweiAppSecret(env) && flagOn(env.FEATURE_SIGNIN_HUAWEI));
}

/** Button and Better Auth provider. Default off. The API key is not required to start. */
export function amazonSignInVisible(env: StoreSignInEnv = process.env): boolean {
  return Boolean(amazonClientId(env) && amazonClientSecret(env) && flagOn(env.FEATURE_SIGNIN_AMAZON));
}
