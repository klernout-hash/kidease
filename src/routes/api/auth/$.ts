import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { reportError } from "@/lib/observe";
import { assertResetMailConfigured } from "@/lib/server/reset-mail-config";
import { assertTurnstileToken } from "@/lib/server/turnstile";

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
    return await auth.handler(request);
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
