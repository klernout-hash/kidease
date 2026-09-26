import { createMiddleware, createStart } from "@tanstack/react-start";
import { reportError } from "@/lib/observe";
import { clientIpFromHeaders, consumeServerFnBudget } from "@/lib/server-fn-throttle";

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

export const startInstance = createStart(() => ({
  requestMiddleware: [sentryRequestMiddleware, serverFnThrottleMiddleware],
  functionMiddleware: [sentryFunctionMiddleware],
}));
