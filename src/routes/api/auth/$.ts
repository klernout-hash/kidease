import { createFileRoute } from "@tanstack/react-router";
import { applySharedAuthCookies, requestWithAliasedAuthCookies } from "@/lib/auth/cookies";
import { requestWithLegacyOAuthCallback } from "@/lib/auth/legacy-oauth-callback";
import { auth } from "@/lib/auth/server";
import { reportError } from "@/lib/observe";
import { assertResetMailConfigured } from "@/lib/server/reset-mail-config";
import { assertTurnstileToken } from "@/lib/server/turnstile";
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
          await assertTurnstileToken(request.headers.get("x-turnstile-token"));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Security check failed";
          return Response.json({ message }, { status: 400 });
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
    return applySharedAuthCookies(incoming, response);
  } catch (err) {
    reportError(err, { route: "/api/auth" });
    throw err;
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
