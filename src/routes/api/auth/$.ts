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
import {
  FACEBOOK_HOST_UNAVAILABLE,
  facebookAuthorizeScopesAllowed,
  facebookOauthHost,
  facebookRedirectMatches,
  facebookRedirectUri,
  stripFacebookSignInScopes,
} from "@/lib/auth/facebook-idp";
import { auth } from "@/lib/auth/server";
import { reportError } from "@/lib/observe";
import { assertResetMailConfigured } from "@/lib/server/reset-mail-config";
import { assertTurnstileToken } from "@/lib/server/turnstile";
import { readTurnstileToken, readTurnstileTokenFromBody } from "@/lib/server/turnstile-verify";
import { parseRetryAfterSeconds, rateLimitWaitCopy } from "@/lib/auth-rate-limit";
import { assertPasswordAllowed } from "@/lib/server/password-hygiene";
import { authMutationAction, VIEW_AS_READ_ONLY_MESSAGE } from "@/lib/view-as";

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

async function prepareFacebookSignIn(
  request: Request,
): Promise<{ request: Request; expectedRedirect: string | null } | Response> {
  if (request.method !== "POST") return { request, expectedRedirect: null };
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (!path.endsWith("/sign-in/social")) return { request, expectedRedirect: null };
  let json: Record<string, unknown> | null = null;
  try {
    json = (await request.clone().json()) as Record<string, unknown>;
  } catch {
    return { request, expectedRedirect: null };
  }
  if (json?.provider !== "facebook") return { request, expectedRedirect: null };
  const expectedRedirect = facebookRedirectUri(request.headers.get("host"));
  const host = facebookOauthHost(request.headers.get("host"));
  if (!expectedRedirect || !host) {
    return Response.json({ message: FACEBOOK_HOST_UNAVAILABLE, code: "FACEBOOK_HOST" }, { status: 400 });
  }
  const headers = new Headers(request.headers);
  headers.set("host", host);
  headers.set("x-forwarded-host", host);
  headers.set("x-forwarded-proto", "https");
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const nextUrl = new URL(request.url);
  nextUrl.protocol = "https:";
  nextUrl.host = host;
  const next = new Request(nextUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(stripFacebookSignInScopes(json)),
  });
  return { request: next, expectedRedirect };
}

async function guardFacebookAuthorize(response: Response, expectedRedirect: string | null): Promise<Response> {
  if (!expectedRedirect) return response;
  const location = response.headers.get("location");
  let authorize = location;
  if (!authorize) {
    try {
      const json = (await response.clone().json()) as { url?: string };
      authorize = json.url || null;
    } catch {
      authorize = null;
    }
  }
  if (!authorize) return response;
  if (!facebookRedirectMatches(authorize, expectedRedirect) || !facebookAuthorizeScopesAllowed(authorize)) {
    return Response.json({ message: FACEBOOK_HOST_UNAVAILABLE, code: "FACEBOOK_REDIRECT" }, { status: 400 });
  }
  return response;
}

async function handleAuth(request: Request) {
  try {
    if (request.method === "POST") {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "");
      if (authMutationAction("POST", path)) {
        const { viewAsBlocksThisRequest } = await import("@/lib/server/view-as");
        if (await viewAsBlocksThisRequest()) {
          return Response.json({ message: VIEW_AS_READ_ONLY_MESSAGE, code: "VIEW_AS_READ_ONLY" }, { status: 403 });
        }
      }
      if (path.endsWith("/forget-password") || path.endsWith("/request-password-reset")) {
        try {
          assertResetMailConfigured();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Email is not configured";
          return Response.json({ message }, { status: 503 });
        }
      }
      if (
        path.endsWith("/sign-up/email") ||
        path.endsWith("/reset-password") ||
        path.endsWith("/change-password")
      ) {
        try {
          const body = (await request.clone().json().catch(() => null)) as {
            password?: unknown;
            newPassword?: unknown;
            email?: unknown;
          } | null;
          const password = String(body?.password || body?.newPassword || "");
          if (password) await assertPasswordAllowed(password, String(body?.email || ""));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Choose a stronger password.";
          return Response.json({ message, code: "PASSWORD_REJECTED" }, { status: 400 });
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
    const prepared = await prepareFacebookSignIn(request);
    if (prepared instanceof Response) return prepared;
    const incoming = requestWithLegacyOAuthCallback(requestWithAliasedAuthCookies(prepared.request));
    const path = new URL(incoming.url).pathname.replace(/\/+$/, "");
    if (request.method === "POST" && isAuthSignOutPath(path)) {
      try {
        const { closeViewAsForCurrentUser } = await import("@/lib/server/view-as");
        await closeViewAsForCurrentUser();
      } catch {
        /* Sign-out must still clear the auth cookie. */
      }
    }
    // Do not answer GET /get-session with a fake signed-out body. A 200
    // `{ user: null }` makes the browser drop a real session, so account
    // looks signed out and Save details never runs. A slow database just
    // stays pending; the client already gives up after SESSION_SETTLE_MS.
    const response = await auth.handler(incoming);
    const facebookSafe = await guardFacebookAuthorize(response, prepared.expectedRedirect);
    const honest = await applyHonestRateLimit(facebookSafe);
    const shared = applySharedAuthCookies(incoming, honest);
    return isAuthSignOutPath(path) ? applyExpiredAuthCookies(incoming, shared) : shared;
  } catch (err) {
    reportError(err, { route: "/api/auth" });
    const message = err instanceof Error && err.message.trim() ? err.message : "Sign-in failed";
    return Response.json({ message, code: "AUTH_HANDLER_ERROR" }, { status: 500 });
  }
}

async function applyHonestRateLimit(response: Response): Promise<Response> {
  if (response.status !== 429) return response;
  const retryAfter = parseRetryAfterSeconds(response.headers.get("retry-after"), 60);
  const message = rateLimitWaitCopy(retryAfter);
  const headers = new Headers(response.headers);
  headers.set("retry-after", String(retryAfter));
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ message, code: "RATE_LIMITED" }), {
    status: 429,
    statusText: "Too Many Requests",
    headers,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});
