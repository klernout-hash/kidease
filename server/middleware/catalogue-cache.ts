/**
 * Public catalogue and anonymous listing server functions are GET JSON.
 * Stamp s-maxage so Cloudflare / Vercel can serve the repeat. HTML is left
 * on max-age=0 by the CSP middleware. User-specific server functions are
 * not in the allow-list.
 */
import { catalogueCacheControl, LISTING_FN_IDS, serverFnIdFromPath } from "../../scripts/catalogue-cache.mjs";

interface CacheEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function applyCache(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", value);
  headers.set("CDN-Cache-Control", value);
  headers.set("Cloudflare-CDN-Cache-Control", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function catalogueCacheMiddleware(
  event: CacheEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const id = serverFnIdFromPath(event.url.pathname);
  const listing = Boolean(id && LISTING_FN_IDS.has(id));
  const result = await next();
  if (!(result instanceof Response)) return result;

  let bodyText = "";
  if (listing && result.status === 200) {
    try {
      bodyText = await result.clone().text();
    } catch {
      bodyText = "";
    }
  }

  const value = catalogueCacheControl({
    pathname: event.url.pathname,
    method: event.req.method,
    status: result.status,
    cookie: event.req.headers.get("cookie"),
    setCookie: result.headers.get("set-cookie"),
    cacheControl: result.headers.get("cache-control"),
    bodyText,
  });
  if (!value) return result;
  return applyCache(result, value);
}
