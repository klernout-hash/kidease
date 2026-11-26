import { getRequest } from "@tanstack/react-start/server";
import { DEV_FALLBACK_USER_ID, resolveRequiredUserId } from "@/lib/access-control";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";
import { parseTimestampMs } from "@/lib/admin-idle";
import {
  aliasInboundAuthCookies,
  isKideasePublicHost,
  unsignedSessionToken,
  withE2eSessionCookie,
} from "./cookies";
import { auth, authConfigured } from "./server";

/**
 * Server-side session resolution (server-only).
 *
 * Because this app runs its OWN Better Auth at same-origin `/api/auth/*`, the
 * session cookie is sent with every request to this app — server functions AND
 * SSR loaders included. So we resolve the user straight from the request cookies
 * via `auth.api.getSession` (no client-minted JWT needed). Never trust a
 * client-supplied user id — only the result of this verification.
 */

/** True when a real database is configured server-side. */
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

/** Re-export so callers can branch on it without importing `server.ts`. */
export { authConfigured };

if (databaseConfigured && !authConfigured) {
  console.error(
    "[auth] DATABASE_URL is set but auth is disabled (VITE_AUTH_ENABLED=false) " +
      "— requireUserId() will reject every request (fail closed) rather than " +
      "share one dev user on a real database.",
  );
}

/** Dev fallback user id, used only when auth is disabled (VITE_AUTH_ENABLED=false). */
export const DEV_USER_ID = DEV_FALLBACK_USER_ID;

/**
 * Thrown by `requireUserId` when the caller has no valid session. Carries
 * `status: 401`; the message is a stable contract — match
 * `err.message === "Unauthorized"` client-side to send the visitor to sign-in.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

export type VerifiedAuthSession = VerifiedUser & {
  /** Public session identifier; unlike token this is not an authentication credential. */
  sessionId: string | null;
  expiresAtMs: number;
  /** Server-only credential. Never serialize a VerifiedAuthSession into route data. */
  token: string | null;
  createdAtMs: number;
};

type SessionLookup = Awaited<ReturnType<typeof auth.api.getSession>>;
const inflightSessionLookups = new Map<string, Promise<SessionLookup>>();

/**
 * One desk page fires 10+ server functions at once, and each one used to run
 * its own Better Auth session query. On Nov 25 they queued on the auth pool
 * and timed out together (get-session-timeout). Concurrent calls with the
 * same cookie now share one in-flight lookup. Nothing is cached after it
 * settles, so sign-out and revocation behave exactly as before.
 */
export function sharedSessionLookup<T>(key: string, run: () => Promise<T>): Promise<T> {
  const map = inflightSessionLookups as unknown as Map<string, Promise<T>>;
  const existing = map.get(key);
  if (existing) return existing;
  const pending = run().finally(() => {
    if (map.get(key) === pending) map.delete(key);
  });
  map.set(key, pending);
  return pending;
}

/**
 * Better Auth already verified the signed session cookie. Prefer this token /
 * createdAt over re-parsing `__Host-grok-auth.session_token` for DB lookups.
 */
export async function getVerifiedAuthSession(
  bearerToken?: string,
): Promise<VerifiedAuthSession | null> {
  if (!authConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  let headers = request.headers;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  let cookie = request.headers.get("cookie");
  if (isKideasePublicHost(host)) cookie = aliasInboundAuthCookies(cookie);
  const preview = withE2eSessionCookie(cookie, host);
  if (preview !== (cookie || "")) cookie = preview;
  if (typeof cookie === "string" && cookie !== (request.headers.get("cookie") || "")) {
    headers = new Headers(headers);
    headers.set("cookie", cookie);
  }
  if (bearerToken) {
    headers = new Headers(headers);
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  // A timeout or database error must throw. Callers that paint private pages
  // (role chrome) treat a throw as degraded and stay on the page. Swallowing
  // it as null looks like a real sign-out and beforeLoad sends /account to
  // /login?intent=in&next=/account with no save confirmation.
  const session = await withTimeout(
    sharedSessionLookup(`${cookie || ""}\n${bearerToken || ""}`, () =>
      auth.api.getSession({ headers }),
    ),
    SQL_SETTLE_MS,
    "get-session-timeout",
  );
  if (!session?.user) return null;
  const rawToken = typeof session.session?.token === "string" ? session.session.token : null;
  const token = unsignedSessionToken(rawToken);
  const persistentFlag = String(process.env.FEATURE_PERSISTENT_SESSIONS || "")
    .trim()
    .toLowerCase();
  if (
    persistentFlag === "1" ||
    persistentFlag === "true" ||
    persistentFlag === "on" ||
    persistentFlag === "yes"
  ) {
    const { enforcePersistentSession } = await import("@/lib/server/persistent-session.server");
    if (!(await enforcePersistentSession(token))) return null;
  }
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    sessionId: typeof session.session?.id === "string" ? session.session.id : null,
    expiresAtMs: parseTimestampMs(session.session?.expiresAt),
    token,
    createdAtMs: parseTimestampMs(session.session?.createdAt),
  };
}

/**
 * Resolve the signed-in user from the current request, or `null` when auth isn't
 * configured / nobody is signed in. Safe to call from server functions and SSR
 * loaders.
 *
 * `bearerToken` is for the LIVE PREVIEW: the app runs in a partitioned iframe
 * whose cookies don't reach the server, so `authMiddleware` forwards the session
 * as a bearer token, which we present as `Authorization: Bearer …` (the `bearer`
 * plugin resolves it). When deployed no token is passed and the cookie is used.
 */
export async function getSessionUser(bearerToken?: string): Promise<VerifiedUser | null> {
  const session = await getVerifiedAuthSession(bearerToken);
  if (!session) return null;
  // Browser bundles never overlay. The server re-checks admin, then may
  // return the person being viewed instead of the operator.
  if (typeof window !== "undefined") return { id: session.id, email: session.email };
  const { effectiveSessionUser } = await import("@/lib/server/view-as");
  return effectiveSessionUser(session);
}

/**
 * Resolve the current user id for a server function, or throw when unauthorized.
 * Prefer `authMiddleware` (`./middleware`), which calls this for you.
 * - Auth enabled (default) -> the verified session user id; throws
 *   `UnauthorizedError` when signed out. Works in the sandbox preview too (real
 *   sign-in via the baked preview client).
 * - Auth disabled (`VITE_AUTH_ENABLED=false`) + `DATABASE_URL` set -> throw (fail
 *   closed): one shared dev user on a real database would let every visitor
 *   read/write everyone's rows.
 * - Auth disabled + no database -> the shared dev user id.
 */
export async function requireUserId(bearerToken?: string): Promise<string> {
  const sessionUserId = authConfigured ? ((await getSessionUser(bearerToken))?.id ?? null) : null;
  const decided = resolveRequiredUserId({
    authConfigured,
    databaseConfigured,
    sessionUserId,
  });
  if (!decided.ok) {
    if (decided.code === "unauthorized") throw new UnauthorizedError();
    throw new Error(decided.error);
  }
  return decided.userId;
}
