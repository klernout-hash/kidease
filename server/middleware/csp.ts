/**
 * Per-request Content-Security-Policy.
 *
 * Must wrap `next()` so it sees HTML after grok-pwa head injection, then
 * stamps a nonce onto every <script> and <style>, injects the runtime
 * style-nonce boot, and sets the header. Filename sorts before grok-pwa.ts
 * / request-guard.ts so this middleware is outermost.
 */
import {
  applyDocumentNonces,
  stripModulePreloadsForPath,
  applyHtmlDocumentCacheHeaders,
  buildContentSecurityPolicy,
  generateNonce,
  isHtmlResponse,
} from "../../scripts/csp.mjs";
import { applyPublicStaticCache } from "../../scripts/public-static-cache.mjs";
import { compressHtmlResponse } from "../lib/html-compression.ts";

interface CspEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function cspMiddleware(
  event: CspEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const nonce = generateNonce();
  const result = await next();
  if (!(result instanceof Response)) return result;

  // An upstream encoder owns its document's existing nonce/CSP. Reading encoded
  // bytes as text or replacing that policy would corrupt the document.
  if (isHtmlResponse(result.headers.get("content-type")) && result.headers.has("content-encoding")) {
    return result;
  }

  const headers = new Headers(result.headers);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));

  if (isHtmlResponse(headers.get("content-type"))) {
    applyHtmlDocumentCacheHeaders(headers);
    applyPublicStaticCache(headers, {
      pathname: event.url.pathname,
      method: event.req.method,
      cookie: event.req.headers.get("cookie"),
      status: result.status,
      setCookie: headers.get("set-cookie"),
    });
  }

  if (!isHtmlResponse(headers.get("content-type")) || !result.body) {
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }

  const stamped = stripModulePreloadsForPath(applyDocumentNonces(await result.text(), nonce), event.url.pathname);
  headers.delete("content-length");
  return compressHtmlResponse(
    new Response(stamped, {
      status: result.status,
      statusText: result.statusText,
      headers,
    }),
    event.req.headers.get("accept-encoding"),
  );
}
