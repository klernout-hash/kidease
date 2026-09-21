/**
 * Cookie/session can lag the Better Auth response by a tick (apex↔www,
 * bearer fallback). Retry instead of treating a successful sign-in as a
 * dead end.
 *
 * Each get-session is bounded. A Cloudflare challenge on the XHR never
 * resolves, and an unbounded retry leaves “Opening your desk…” up forever.
 */
import { resolveAfter } from "../timeout.ts";

export const SESSION_SETTLE_RETRIES = [0, 200, 500, 1000, 2000] as const;
export const GET_SESSION_ATTEMPT_MS = 4000;

export async function waitForSignedInSession<T extends { data?: { user?: unknown } | null }>(
  getSession: () => Promise<T>,
): Promise<T | null> {
  for (const delay of SESSION_SETTLE_RETRIES) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const session = await Promise.race([
      getSession().catch(() => null),
      resolveAfter(GET_SESSION_ATTEMPT_MS, null),
    ]);
    if (session?.data?.user) return session;
  }
  return null;
}
