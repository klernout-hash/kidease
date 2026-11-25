/**
 * Session gate for `/verify-2fa`.
 *
 * Google OAuth (staff desks especially) lands here via `callbackURL` before
 * Better Auth `useSession()` has a user. A first empty get-session or a
 * pending→null flicker must not `RedirectToSignIn` — that flashes login and
 * remounts the code screen.
 */
import { SESSION_SETTLE_RETRIES } from "./session-settle.ts";
import { sanitizePostLoginNext } from "../desks.ts";
import type { AppUser } from "./use-current-user.ts";

/** Cover the get-session retry budget plus one short tick after OAuth. */
export const VERIFY_2FA_SESSION_GRACE_MS =
  SESSION_SETTLE_RETRIES.reduce((sum: number, ms) => sum + ms, 0) + 300;

export type Verify2faSessionPhase = "wait" | "ready" | "signed_out";

export function verify2faSearchNext(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  return sanitizePostLoginNext(value) ?? "/parent";
}

/**
 * `serverSignedIn`: what the cookie session on the server says.
 *   - left out → the browser alone decides (older callers).
 *   - null → the server answer is still on its way; keep waiting.
 *   - true → signed in on the server. Show the code form even when the
 *     browser has no user yet (A2: government sign-in bounce).
 *   - false → only then, with the browser also signed out, leave for sign-in.
 */
export function decideVerify2faSessionGate(input: {
  hasUser: boolean;
  isPending: boolean;
  graceElapsed: boolean;
  serverSignedIn?: boolean | null;
}): Verify2faSessionPhase {
  if (input.hasUser) return "ready";
  if (input.serverSignedIn === true) return "ready";
  if (input.isPending || !input.graceElapsed) return "wait";
  if (input.serverSignedIn === null) return "wait";
  return "signed_out";
}

/** `/gov` or `/fr/gov` desk paths, not `/gov-terms`. */
export function isGovDeskPath(path: string | null | undefined): boolean {
  const clean = (String(path || "").split("?")[0] || "").trim();
  return /^\/(fr\/)?gov(\/|$)/.test(clean);
}

/**
 * `/login?next=/gov…` → the government sign-in page, so government sign-in
 * has one path (it checks the email-code step itself). Null for other next.
 */
export function govLoginRedirectForNext(
  next: string | null | undefined,
  routeLocale: "en" | "fr",
): string | null {
  const clean = (String(next || "").split("?")[0] || "").trim();
  if (!isGovDeskPath(clean)) return null;
  const fr = clean.startsWith("/fr/") || routeLocale === "fr";
  return fr ? "/fr/gov/login" : "/gov/login";
}

/** Better Auth `getSession().data.user` → the app user shape, or null. */
export function mapAuthSessionUser(user: unknown): AppUser | null {
  if (!user || typeof user !== "object") return null;
  const row = user as { id?: unknown; name?: unknown; email?: unknown; image?: unknown; emailVerified?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  return {
    id: row.id,
    displayName: typeof row.name === "string" ? row.name : null,
    primaryEmail: typeof row.email === "string" ? row.email : null,
    profileImageUrl: typeof row.image === "string" ? row.image : null,
    emailVerified: row.emailVerified === true,
    isDevFallback: false,
  };
}
