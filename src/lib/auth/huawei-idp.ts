/**
 * Sign in with Huawei ID (HMS Account Kit, OAuth 2.0).
 *
 * Shown only when FEATURE_SIGNIN_HUAWEI or FEATURE_LOGIN_HUAWEI is on and
 * the app id and secret are set. Default off.
 *
 * Huawei registered one callback only:
 * `https://www.kidease.ca/api/auth/callback/huawei`.
 * The apex host and every Vercel host are not registered, so the
 * redirect_uri is that www URL even when the request arrives on another host.
 *
 * The website, iPhone app, Microsoft app, and Huawei app use this OAuth
 * redirect. The Huawei shell does not include HMS Account Kit (only HMS
 * Push). The button opens this page in the system browser sheet.
 *
 * Server env only. Never `VITE_*`. Never commit the secret.
 *
 *   HUAWEI_APP_ID          AppGallery Connect app id (also accepted as HUAWEI_CLIENT_ID)
 *   HUAWEI_APP_SECRET      App secret (also accepted as HUAWEI_CLIENT_SECRET)
 *   FEATURE_SIGNIN_HUAWEI  1 to turn the button on
 *   FEATURE_LOGIN_HUAWEI   same switch, either flag is enough
 */
import { huaweiAppId, huaweiAppSecret, huaweiSignInVisible } from "./store-signin-flags.ts";

export const HUAWEI_AUTHORIZATION_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize";
export const HUAWEI_TOKEN_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/token";
export const HUAWEI_USERINFO_URL = "https://account.cloud.huawei.com/rest.php?nsp_svc=GOpen.User.getInfo";
export const HUAWEI_SCOPES = ["openid", "profile", "email"] as const;
export const HUAWEI_CALLBACK_PATH = "/api/auth/callback/huawei";
/** The only redirect Huawei has registered. Do not swap in the request host. */
export const HUAWEI_REDIRECT_URI = `https://www.kidease.ca${HUAWEI_CALLBACK_PATH}`;

/**
 * Always the registered www callback. `requestHost` is unused on purpose:
 * kidease.ca, a Vercel alias, and www must all send the same redirect_uri.
 */
export function huaweiRedirectUri(_requestHost?: string | null): string {
  return HUAWEI_REDIRECT_URI;
}

export type HuaweiProfileInput = {
  openID?: string | null;
  unionID?: string | null;
  sub?: string | null;
  displayName?: string | null;
  email?: string | null;
  email_verified?: boolean | string | number | null;
  emailVerified?: boolean | string | number | null;
  headPictureURL?: string | null;
};

export type LinkedProfile = {
  id: string;
  name?: string;
  email?: string;
  emailVerified: boolean;
  image?: string;
};

function verifiedFlag(raw: boolean | string | number | null | undefined): boolean | null {
  if (raw == null || raw === "") return null;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const value = String(raw).trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

/**
 * Huawei returns an email only after the person consents to the email scope.
 * An explicit unverified flag is not used to join an existing account.
 * A present email with no flag is the verified account email.
 */
export function mapHuaweiProfile(profile: HuaweiProfileInput): LinkedProfile | null {
  const id = String(profile.openID || profile.unionID || profile.sub || "").trim();
  if (!id) return null;
  const email = String(profile.email || "").trim();
  const flag = verifiedFlag(profile.email_verified ?? profile.emailVerified);
  const verified = flag == null ? Boolean(email) : flag;
  const name = String(profile.displayName || "").trim();
  const image = String(profile.headPictureURL || "").trim();
  return {
    id,
    emailVerified: Boolean(email) && verified,
    ...(name ? { name } : {}),
    ...(image ? { image } : {}),
    ...(email && verified ? { email } : {}),
  };
}

export async function huaweiUserFromAccessToken(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedProfile | null> {
  const access = accessToken.trim();
  if (!access) return null;
  const response = await fetchImpl(HUAWEI_USERINFO_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ access_token: access, getNickName: "1" }),
  });
  if (!response.ok) return null;
  const profile = (await response.json()) as HuaweiProfileInput & { error?: string };
  if (profile?.error) return null;
  return mapHuaweiProfile(profile);
}

type HuaweiOAuthConfig = {
  providerId: "huawei";
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectURI: string;
  pkce: false;
  getUserInfo: (tokens: { accessToken?: string | null }) => Promise<LinkedProfile | null>;
};

export function huaweiOAuthConfig(env: NodeJS.ProcessEnv = process.env): HuaweiOAuthConfig | null {
  if (!huaweiSignInVisible(env)) return null;
  const clientId = huaweiAppId(env);
  const clientSecret = huaweiAppSecret(env);
  if (!clientId || !clientSecret) return null;
  return {
    providerId: "huawei",
    clientId,
    clientSecret,
    authorizationUrl: HUAWEI_AUTHORIZATION_URL,
    tokenUrl: HUAWEI_TOKEN_URL,
    scopes: [...HUAWEI_SCOPES],
    redirectURI: huaweiRedirectUri(),
    pkce: false,
    getUserInfo: async (tokens) => {
      const access = tokens.accessToken?.trim();
      if (!access) return null;
      return huaweiUserFromAccessToken(access);
    },
  };
}
