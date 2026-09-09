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

export function decideVerify2faSessionGate(input: {
  hasUser: boolean;
  isPending: boolean;
  graceElapsed: boolean;
}): Verify2faSessionPhase {
  if (input.hasUser) return "ready";
  if (input.isPending || !input.graceElapsed) return "wait";
  return "signed_out";
}

/** Better Auth `getSession().data.user` → the app user shape, or null. */
export function mapAuthSessionUser(user: unknown): AppUser | null {
  if (!user || typeof user !== "object") return null;
  const row = user as { id?: unknown; name?: unknown; email?: unknown; image?: unknown };
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  return {
    id: row.id,
    displayName: typeof row.name === "string" ? row.name : null,
    primaryEmail: typeof row.email === "string" ? row.email : null,
    profileImageUrl: typeof row.image === "string" ? row.image : null,
    isDevFallback: false,
  };
}
