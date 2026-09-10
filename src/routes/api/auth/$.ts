/**
 * Cloudflare WAF / Bot Fight on kidease.ca must skip `/api/auth/*`
 * (and `/_serverFn/*`). A CF HTML 403 never reaches this handler — the
 * browser only sees "Sign-in failed" unless the client maps that HTML.
 * See docs/cloudflare.md.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  applyExpiredAuthCookies,
  applySharedAuthCookies,
  isAuthSignOutPath,
  requestWithAliasedAuthCookies,
} from "@/lib/auth/cookies";
import { requestWithLegacyOAuthCallback } from "@/lib/auth/legacy-oauth-callback";
import { auth } from "@/lib/auth/server";
import { reportError } from "@/lib/observe";
import { assertResetMailConfigured } from "@/lib/server/reset-mail-config";
import { assertTurnstileToken } from "@/lib/server/turnstile";
import { readTurnstileToken, readTurnstileTokenFromBody } from "@/lib/server/turnstile-verify";
import { SQL_SETTLE_MS, resolveAfter } from "@/lib/timeout";

const TURNSTILE_AUTH_PATHS = [
  "/sign-in/email",
  "/sign-up/email",
  "/forget-password",
  "/request-password-reset",
  "/reset-password",
];

function authPathNeedsTurnstile(pathname: string) {
  const path = pathname.replace(/\/+$/, "");
  return TURNSTILE_AUTH_PATHS.some((suffix) => path.endsWith(suffix));
}

async function turnstileTokenFromAuthRequest(request: Request): Promise<string> {
  const header = readTurnstileToken(request.headers);
  if (header) return header;
  try {
    return readTurnstileTokenFromBody(await request.clone().json());
  } catch {
    return "";
  }
}

async function handleAuth(request: Request) {
  try {
    if (request.method === "POST") {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "");
      if (path.endsWith("/forget-password") || path.endsWith("/request-password-reset")) {
        try {
          assertResetMailConfigured();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Email is not configured";
          return Response.json({ message }, { status: 503 });
        }
      }
      if (authPathNeedsTurnstile(url.pathname)) {
        try {
          await assertTurnstileToken(await turnstileTokenFromAuthRequest(request), {
            headers: request.headers,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Security check failed";
          return Response.json({ message, code: "SECURITY_CHECK" }, { status: 400 });
        }
      }
    }
    const incoming = requestWithLegacyOAuthCallback(requestWithAliasedAuthCookies(request));
    const path = new URL(incoming.url).pathname.replace(/\/+$/, "");
    const handled = auth.handler(incoming);
    // useSession() stays isPending until this returns. A wedged Neon or
    // Cloudflare HTML challenge must not pin the client on the boot logo.
    const response =
      incoming.method === "GET" && path.endsWith("/get-session")
        ? await Promise.race([
            handled,
            resolveAfter(SQL_SETTLE_MS, Response.json({ session: null, user: null })),
          ])
        : await handled;
    const shared = applySharedAuthCookies(incoming, response);
    return isAuthSignOutPath(path) ? applyExpiredAuthCookies(incoming, shared) : shared;
  } catch (err) {
    reportError(err, { route: "/api/auth" });
    const message = err instanceof Error && err.message.trim() ? err.message : "Sign-in failed";
    return Response.json({ message, code: "AUTH_HANDLER_ERROR" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});
