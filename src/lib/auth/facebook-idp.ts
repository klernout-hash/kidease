/**
 * Native Sign in with Facebook (Facebook's own IDP — not the Grok auth broker).
 *
 * When `FACEBOOK_CLIENT_ID` + `FACEBOOK_CLIENT_SECRET` are set, Better Auth's
 * `socialProviders.facebook` talks to Facebook directly. Callback path is
 * `/api/auth/callback/facebook`.
 *
 * Register these redirect URIs on the Meta app (Facebook Login → Valid OAuth
 * Redirect URIs). App ID maps to clientId; App Secret maps to clientSecret:
 *   https://kidease.ca/api/auth/callback/facebook
 *   https://www.kidease.ca/api/auth/callback/facebook
 *   https://kidease-git.vercel.app/api/auth/callback/facebook
 *
 * Server env only. Never `VITE_*`. Never commit secrets.
 *
 * Required process env (injected on the host; Better Auth documented names):
 *   FACEBOOK_CLIENT_ID
 *   FACEBOOK_CLIENT_SECRET
 */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const FACEBOOK_CLIENT_ID = env("FACEBOOK_CLIENT_ID");
export const FACEBOOK_CLIENT_SECRET = env("FACEBOOK_CLIENT_SECRET");

export const facebookIdpConfigured = Boolean(FACEBOOK_CLIENT_ID && FACEBOOK_CLIENT_SECRET);

/**
 * Facebook Login (consumer) permissions KidEase may request.
 *
 * Better Auth defaults to `email` + `public_profile`. Meta then shows
 * developers "Invalid Scopes: email" when `email` is not added under
 * Use Cases → Authentication and account creation, or when the app has
 * Facebook Login for Business instead of Facebook Login.
 *
 * `public_profile` is the permission Facebook Login always grants.
 * Do not request OpenID scopes (`openid`, `profile`) — those are not
 * Facebook Login permissions. Do not use the Better Auth docs key
 * `scopes` (plural); the provider only reads `scope` + `disableDefaultScope`.
 *
 * After Kyle adds `email` on the Meta app, append it here so Graph returns
 * a real address. Until then, `mapFacebookProfileToUser` supplies a
 * placeholder so Better Auth can still create the account.
 *
 * @see https://developers.facebook.com/docs/facebook-login/permissions
 */
export const FACEBOOK_LOGIN_SCOPES = ["public_profile"] as const;

export type FacebookProfileEmailInput = {
  id?: string;
  sub?: string;
  email?: string | null;
};

/**
 * Facebook often omits `email` (permission not granted, phone-only account,
 * or Meta marked the address invalid). Better Auth 1.7 still requires one
 * on the user row — use the app-scoped Facebook id as a `.invalid` placeholder
 * so sign-in can finish. Real emails from Graph win when present.
 */
export function mapFacebookProfileToUser(profile: FacebookProfileEmailInput): {
  email?: string;
} {
  const email = typeof profile.email === "string" ? profile.email.trim() : "";
  if (email) return { email };
  const facebookId = profile.id?.trim() || profile.sub?.trim();
  if (!facebookId) return {};
  return { email: `${facebookId}@facebook.invalid` };
}
