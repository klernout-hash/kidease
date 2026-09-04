/**
 * Native Sign in with Facebook (Facebook's own IDP — not the Grok auth broker).
 *
 * When `FACEBOOK_CLIENT_ID` + `FACEBOOK_CLIENT_SECRET` are set, Better Auth's
 * `socialProviders.facebook` talks to Facebook directly. Callback path is
 * `/api/auth/callback/facebook`.
 *
 * If those are unset, the former X / Twitter env slots are accepted so Kyle can
 * paste Facebook app credentials into the existing Vercel "X login" fields:
 *   TWITTER_CLIENT_ID
 *   TWITTER_CLIENT_SECRET
 *
 * Register these redirect URIs in the Facebook app (Facebook Login → Settings):
 *   https://kidease.ca/api/auth/callback/facebook
 *   https://www.kidease.ca/api/auth/callback/facebook
 *   https://kidease-git.vercel.app/api/auth/callback/facebook
 *
 * Server env only. Never `VITE_*`. Never commit secrets.
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const FACEBOOK_CLIENT_ID = env("FACEBOOK_CLIENT_ID") || env("TWITTER_CLIENT_ID");
export const FACEBOOK_CLIENT_SECRET = env("FACEBOOK_CLIENT_SECRET") || env("TWITTER_CLIENT_SECRET");

export const facebookIdpConfigured = Boolean(FACEBOOK_CLIENT_ID && FACEBOOK_CLIENT_SECRET);
