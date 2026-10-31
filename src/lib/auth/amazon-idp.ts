/**
 * Login with Amazon (Login with Amazon OAuth, not Amazon Pay).
 *
 * Shown only when FEATURE_SIGNIN_AMAZON is on and the security-profile
 * client id and secret are set. Default off. Callback `/api/auth/callback/amazon`.
 *
 * Server env only. Never `VITE_*`. Never commit the secret or the API key.
 *
 *   AMAZON_CLIENT_ID       Security profile client id
 *   AMAZON_CLIENT_SECRET   Security profile client secret
 *   AMAZON_API_KEY         API key for package ca.kidease.app (not used in this exchange)
 *   FEATURE_SIGNIN_AMAZON  1 to turn the button on
 */
import { amazonClientId, amazonClientSecret, amazonSignInVisible } from "./store-signin-flags.ts";
import type { LinkedProfile } from "./huawei-idp.ts";

export const AMAZON_AUTHORIZATION_URL = "https://www.amazon.com/ap/oa";
export const AMAZON_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
export const AMAZON_USERINFO_URL = "https://api.amazon.com/user/profile";
export const AMAZON_SCOPES = ["profile"] as const;
export const AMAZON_CALLBACK_PATH = "/api/auth/callback/amazon";

export type AmazonProfileInput = {
  user_id?: string | null;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
};

/**
 * Login with Amazon returns the account email on the profile scope.
 * That address is the verified Amazon account email. An empty email is not
 * used to join an existing KidEase account.
 */
export function mapAmazonProfile(profile: AmazonProfileInput): LinkedProfile | null {
  const id = String(profile.user_id || profile.userId || "").trim();
  if (!id) return null;
  const email = String(profile.email || "").trim();
  const name = String(profile.name || "").trim();
  return {
    id,
    emailVerified: Boolean(email),
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
  };
}

export async function amazonUserFromAccessToken(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedProfile | null> {
  const access = accessToken.trim();
  if (!access) return null;
  const response = await fetchImpl(AMAZON_USERINFO_URL, {
    headers: { authorization: `Bearer ${access}`, accept: "application/json" },
  });
  if (!response.ok) return null;
  const profile = (await response.json()) as AmazonProfileInput & { error?: string };
  if (profile?.error) return null;
  return mapAmazonProfile(profile);
}

type AmazonOAuthConfig = {
  providerId: "amazon";
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce: false;
  getUserInfo: (tokens: { accessToken?: string | null }) => Promise<LinkedProfile | null>;
};

export function amazonOAuthConfig(env: NodeJS.ProcessEnv = process.env): AmazonOAuthConfig | null {
  if (!amazonSignInVisible(env)) return null;
  const clientId = amazonClientId(env);
  const clientSecret = amazonClientSecret(env);
  if (!clientId || !clientSecret) return null;
  return {
    providerId: "amazon",
    clientId,
    clientSecret,
    authorizationUrl: AMAZON_AUTHORIZATION_URL,
    tokenUrl: AMAZON_TOKEN_URL,
    scopes: [...AMAZON_SCOPES],
    pkce: false,
    getUserInfo: async (tokens) => {
      const access = tokens.accessToken?.trim();
      if (!access) return null;
      return amazonUserFromAccessToken(access);
    },
  };
}
