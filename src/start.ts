import { createMiddleware, createStart } from "@tanstack/react-start";
import { reportError } from "@/lib/observe";
import { nativeAdminRedirectTarget } from "@/lib/native-admin";
import { clientIpFromHeaders, consumeServerFnBudget } from "@/lib/server-fn-throttle";

/**
 * Native shells must not document-GET /admin*. Cloudflare Access answers that
 * path before this app when it is on the DNS edge, so this hop only runs when
 * the request reaches Vercel. The destination is not under /admin.
 */
const nativeShellMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return next();
  }
  if (
    url.pathname === "/auth/app-return" ||
    url.pathname === "/auth/native-handoff" ||
    url.pathname === "/auth/native-start"
  ) {
    const { handleNativeAuthAppReturn, handleNativeAuthHandoff, handleNativeAuthStart } = await import(
      "@/lib/auth/native-oauth-return.server"
    );
    if (url.pathname === "/auth/app-return") return handleNativeAuthAppReturn(request);
    if (url.pathname === "/auth/native-start") return handleNativeAuthStart(request);
    return handleNativeAuthHandoff(request);
  }
  const target = nativeAdminRedirectTarget({
    pathname: url.pathname,
    userAgent: request.headers.get("user-agent"),
    cookie: request.headers.get("cookie"),
  });
  if (!target) return next();
  const dest = new URL(target, url.origin);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${dest.pathname}${dest.search}`,
      "cache-control": "no-store",
    },
  });
});

const sentryRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  try {
    return await next();
  } catch (err) {
    const path = (() => {
      try {
        return new URL(request.url).pathname;
      } catch {
        return "ssr";
      }
    })();
    reportError(err, { route: path });
    throw err;
  }
});

const sentryFunctionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    reportError(err, { route: "server-fn" });
    throw err;
  }
});

/**
 * Shed a stuck tab before it reaches Neon. Runs on the HTTP `/_serverFn/`
 * request so a method mismatch (an old tab still POSTing) is counted too.
 * A normal desk load fits in the burst. No CF-Connecting-IP → allow.
 */
const serverFnThrottleMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  let fnId = "";
  try {
    const path = new URL(request.url).pathname;
    const marker = "/_serverFn/";
    const at = path.indexOf(marker);
    if (at < 0) return next();
    fnId = decodeURIComponent((path.slice(at + marker.length).split("/")[0] || "").slice(0, 128));
  } catch {
    return next();
  }
  let decision: { ok: true } | { ok: false; retryAfterSec: number } = { ok: true };
  try {
    decision = consumeServerFnBudget(clientIpFromHeaders(request.headers), fnId);
  } catch {
    return next();
  }
  if (!decision.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "retry-after": String(decision.retryAfterSec),
        "cache-control": "no-store",
      },
    });
  }
  return next();
});

/**
 * First-visit language from Vercel location headers. Runs before the page
 * renders so a Quebec visitor gets the French URL in one temporary hop.
 * A failure serves the URL they asked for.
 */
function skipDocumentLocale(request: Request): boolean {
  try {
    const path = new URL(request.url).pathname;
    return (
      path === "/img" ||
      path.startsWith("/assets/") ||
      path.startsWith("/photos/") ||
      path.startsWith("/fonts/") ||
      path.startsWith("/icons/") ||
      path.startsWith("/ingest")
    );
  } catch {
    return false;
  }
}

const localeRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  if (skipDocumentLocale(request)) return next();
  const { localeDocumentDecision, stampProfileLocaleCookie } = await import("@/lib/locale-choice.server");
  const decision = await localeDocumentDecision(request);
  if (decision.redirect) return decision.redirect;
  const result = await next();
  try {
    stampProfileLocaleCookie(request, result.response.headers, decision.hint);
  } catch {
    /* a locked response still renders */
  }
  return result;
});

const govHttpIsolation = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  try {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return next();
    const { blockGovernmentOnPrivateHttp } = await import("@/lib/server/gov-guard.server");
    const blocked = await blockGovernmentOnPrivateHttp(request);
    if (blocked) return blocked;
  } catch {
    return next();
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [
    nativeShellMiddleware,
    sentryRequestMiddleware,
    localeRequestMiddleware,
    serverFnThrottleMiddleware,
    govHttpIsolation,
  ],
  functionMiddleware: [sentryFunctionMiddleware],
}));
