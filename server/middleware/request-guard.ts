/**
 * Nitro request middleware: hide admin desks on `*.vercel.app` (Cloudflare
 * Access only sits on www.kidease.ca), send apex document GETs to www so
 * login is not split across `__Host-` cookies, 404 QA ghost-listing
 * document URLs, and serve `/.well-known/change-password`.
 *
 * Uses the `Host` header, not `X-Forwarded-Host`, so a spoofed forwarded host
 * cannot un-gate a vercel.app request. `www.kidease.ca` keeps serving /admin
 * after Access. `/` on kidease-git.vercel.app is left alone for the
 * Cloudflare Health Check.
 */
import { decideRequest, isDirectDemoListingPath, notFoundDocument, stripPrivateRoutePreloads } from "../../scripts/request-guard.mjs";

function adminNoindexPath(pathname: string): boolean {
  const raw = pathname.split("?")[0] || "/";
  const path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-");
}

interface RequestGuardEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function requestGuardMiddleware(
  event: RequestGuardEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const decision = decideRequest({
    host: event.req.headers.get("host") ?? event.url.host,
    pathname: event.url.pathname,
    search: event.url.search,
    method: event.req.method,
    cookie: event.req.headers.get("cookie"),
  });

  if (decision.action === "redirect") {
    return new Response(null, {
      status: decision.status,
      headers: {
        location: decision.location,
        ...(decision.status === 303 ? { "cache-control": "no-store" } : {}),
      },
    });
  }

  if (decision.action === "asset_miss") {
    // Static files are served before this middleware. If one still arrives as
    // JavaScript or CSS, keep it. An HTML body is the app shell standing in
    // for a missing chunk, and browsers will cache that under the script URL.
    let result: unknown = null;
    try {
      result = await next();
    } catch {
      result = null;
    }
    if (result instanceof Response) {
      const type = (result.headers.get("content-type") || "").toLowerCase();
      if (result.ok && (type.includes("javascript") || type.includes("text/css"))) return result;
    }
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "cdn-cache-control": "no-store",
        "cloudflare-cdn-cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  if (decision.action === "not_found") {
    const path = event.url.pathname;
    const listing = path.includes("/daycare/") || path.includes("/book/");
    return new Response(notFoundDocument(listing ? "listing" : "page"), {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
        "cache-control": "no-store",
      },
    });
  }

  const result = await next();
  const path = event.url.pathname;
  const isPublicHtml =
    result instanceof Response &&
    (result.headers.get("content-type") || "").includes("text/html") &&
    !adminNoindexPath(path) &&
    !path.startsWith("/gov");
  if (isPublicHtml && result instanceof Response) {
    const html = stripPrivateRoutePreloads(await result.text());
    const headers = new Headers(result.headers);
    headers.delete("content-length");
    return new Response(html, { status: result.status, statusText: result.statusText, headers });
  }
  if ((adminNoindexPath(event.url.pathname) || isDirectDemoListingPath(event.url.pathname)) && result instanceof Response) {
    const headers = new Headers(result.headers);
    headers.set("x-robots-tag", "noindex, nofollow");
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
  return result;
}
