/**
 * Staff 2FA gate. Lives in a `.server` module so `getCookie` never enters the
 * client graph. `src/lib/server/two-factor.ts` is imported by `/verify-2fa`
 * and TwoFactorGate — TanStack Start denies `@tanstack/react-start/server`
 * there unless it stays inside createServerFn handlers.
 */
import { getCookie } from "@tanstack/react-start/server";
import { SHARED_TWO_FACTOR_COOKIE, TWO_FACTOR_COOKIE } from "@/lib/auth/cookies";
import { isTwoFactorVerified } from "@/lib/two-factor-cookie";

function secret() {
  return (process.env.BETTER_AUTH_SECRET || process.env.ADMIN_EMAIL || "kidease-preview").trim();
}

function twoFactorCookieRaw(): string | null {
  return getCookie(TWO_FACTOR_COOKIE) ?? getCookie(SHARED_TWO_FACTOR_COOKIE) ?? null;
}

/** Fail closed: missing/invalid cookie or a thrown status check blocks staff. */
export function assertTwoFactorVerified(userId: string) {
  try {
    if (!isTwoFactorVerified(userId, twoFactorCookieRaw(), secret())) {
      throw new Error("Two-factor verification required");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Two-factor verification required") throw err;
    throw new Error("Two-factor verification required");
  }
}
