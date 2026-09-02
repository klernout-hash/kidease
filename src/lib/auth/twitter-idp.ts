/**
 * Native Sign in with X (Twitter's own IDP — not the Grok auth broker).
 *
 * When `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` are set, Better Auth's
 * `socialProviders.twitter` talks to X directly. Better Auth's social id is
 * still `twitter`. Callback path is `/api/auth/callback/twitter`.
 *
 * Register these redirect URIs on the X developer portal (OAuth 2.0):
 *   https://kidease.ca/api/auth/callback/twitter
 *   https://www.kidease.ca/api/auth/callback/twitter
 *   https://kidease-git.vercel.app/api/auth/callback/twitter
 *
 * Server env only. Never `VITE_*`. Never commit secrets.
 *
 * Required process env (injected on the host; Better Auth documented names):
 *   TWITTER_CLIENT_ID
 *   TWITTER_CLIENT_SECRET
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const TWITTER_CLIENT_ID = env("TWITTER_CLIENT_ID");
export const TWITTER_CLIENT_SECRET = env("TWITTER_CLIENT_SECRET");

export const twitterIdpConfigured = Boolean(TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET);
