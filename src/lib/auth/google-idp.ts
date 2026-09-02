/**
 * Native Sign in with Google (Google's own IDP — not the Grok auth broker).
 *
 * When `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set, Better Auth's
 * `socialProviders.google` talks to Google directly. Callback path is
 * `/api/auth/callback/google` (already registered on the GCP KidEase web client
 * for kidease.ca, www.kidease.ca, and kidease-git.vercel.app).
 *
 * Server env only. Never `VITE_*`. Never commit secrets.
 *
 * Required process env (injected on the host):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");

export const googleIdpConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
