/**
 * Native Sign in with Facebook (Facebook's own IDP — not the Grok auth broker).
 *
 * When `FACEBOOK_CLIENT_ID` + `FACEBOOK_CLIENT_SECRET` are set, Better Auth's
 * `socialProviders.facebook` talks to Facebook directly. Callback path is
 * `/api/auth/callback/facebook`.
 *
 * The Meta app (Development mode) allows exactly these redirect URIs, with no
 * trailing slash. Derive the one that matches the request host. Any other host,
 * including random `*.vercel.app` previews and the Grok preview broker, must
 * not start Facebook login.
 *
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
import { facebookPlaceholderEmail, isFacebookPlaceholderEmail } from "./facebook-address.ts";

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const FACEBOOK_CLIENT_ID = env("FACEBOOK_CLIENT_ID");
export const FACEBOOK_CLIENT_SECRET = env("FACEBOOK_CLIENT_SECRET");

export const facebookIdpConfigured = Boolean(FACEBOOK_CLIENT_ID && FACEBOOK_CLIENT_SECRET);

export const FACEBOOK_LOGIN_FLAG = "FEATURE_FACEBOOK_LOGIN";

type FacebookLoginEnv = {
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  FEATURE_FACEBOOK_LOGIN?: string;
};

function flagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Continue with Facebook stays hidden until the Meta app is Live.
 * Credentials alone are not enough — parked apps show "App not active".
 * Set FEATURE_FACEBOOK_LOGIN=1 after Meta review. Default off.
 * The button also stays hidden unless the request host is one of the three
 * registered redirect hosts (`facebookOauthHost`).
 */
export function facebookLoginVisible(envMap: FacebookLoginEnv = process.env): boolean {
  const creds = Boolean(envMap.FACEBOOK_CLIENT_ID?.trim() && envMap.FACEBOOK_CLIENT_SECRET?.trim());
  return creds && flagOn(envMap.FEATURE_FACEBOOK_LOGIN);
}

/**
 * Facebook Login permissions KidEase requests. Nothing else.
 * `disableDefaultScope` is required so Better Auth does not append a second copy.
 * Do not request OpenID scopes (`openid`, `profile`).
 *
 * @see https://developers.facebook.com/docs/facebook-login/permissions
 */
export const FACEBOOK_LOGIN_SCOPES = ["email", "public_profile"] as const;

export const FACEBOOK_CALLBACK_PATH = "/api/auth/callback/facebook";

/** Exact hosts registered on the Meta app. No wildcard, no trailing slash. */
export const FACEBOOK_OAUTH_HOSTS = ["kidease.ca", "www.kidease.ca", "kidease-git.vercel.app"] as const;

export type FacebookOauthHost = (typeof FACEBOOK_OAUTH_HOSTS)[number];

/** Shown when Facebook cannot start on this address. English; French via presentAuthCopy. */
export const FACEBOOK_HOST_UNAVAILABLE =
  "Continue with Facebook is not available on this address. Open kidease.ca.";

export {
  FACEBOOK_EMAIL_REQUIRED_MESSAGE,
  FACEBOOK_PLACEHOLDER_DOMAIN,
  facebookContactBlocksAction,
  facebookPlaceholderEmail,
  isFacebookPlaceholderEmail,
} from "./facebook-address.ts";

export function facebookHostname(hostHeader: string | null | undefined): string {
  const first = String(hostHeader || "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .replace(/\/+$/, "");
  if (!first) return "";
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end >= 0 ? first.slice(1, end) : first;
  }
  return first.split(":")[0] ?? "";
}

export function facebookOauthHost(hostHeader: string | null | undefined): FacebookOauthHost | null {
  const host = facebookHostname(hostHeader);
  if (host === "kidease.ca" || host === "www.kidease.ca" || host === "kidease-git.vercel.app") return host;
  return null;
}

/** Exact redirect_uri for this host, or null when Facebook must stay hidden. */
export function facebookRedirectUri(hostHeader: string | null | undefined): string | null {
  const host = facebookOauthHost(hostHeader);
  if (!host) return null;
  return `https://${host}${FACEBOOK_CALLBACK_PATH}`;
}

export function facebookAuthorizeRedirect(authorizeUrl: string): string | null {
  try {
    return new URL(authorizeUrl).searchParams.get("redirect_uri");
  } catch {
    return null;
  }
}

export function facebookRedirectMatches(authorizeUrl: string, expectedRedirect: string): boolean {
  if (!expectedRedirect || expectedRedirect.endsWith("/")) return false;
  return facebookAuthorizeRedirect(authorizeUrl) === expectedRedirect;
}

/** Scope query must be exactly email and public_profile, comma or space separated. */
export function facebookAuthorizeScopesAllowed(authorizeUrl: string): boolean {
  let raw = "";
  try {
    raw = new URL(authorizeUrl).searchParams.get("scope") || "";
  } catch {
    return false;
  }
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== FACEBOOK_LOGIN_SCOPES.length) return false;
  return parts.every((scope, index) => scope === FACEBOOK_LOGIN_SCOPES[index]);
}

export function stripFacebookSignInScopes(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const next = { ...(body as Record<string, unknown>) };
  delete next.scopes;
  return next;
}

export type FacebookProfileEmailInput = {
  id?: string;
  sub?: string;
  email?: string | null;
};

/**
 * Facebook often omits email (permission declined, phone-only account, or Meta
 * marked the address invalid). Better Auth still requires one on the user row.
 * Key the row on the app-scoped Facebook id with a `.invalid` address so
 * sign-in does not crash. A real Graph email wins. Callers must not send mail
 * to the placeholder, and messaging or booking stays closed until a confirmed
 * address replaces it.
 */
export function mapFacebookProfileToUser(profile: FacebookProfileEmailInput): {
  email?: string;
  emailVerified?: boolean;
} {
  const email = typeof profile.email === "string" ? profile.email.trim() : "";
  if (email && !isFacebookPlaceholderEmail(email)) return { email };
  const facebookId = profile.id?.trim() || profile.sub?.trim() || "";
  const placeholder = facebookId ? facebookPlaceholderEmail(facebookId) : null;
  if (!placeholder) return {};
  return { email: placeholder, emailVerified: false };
}
