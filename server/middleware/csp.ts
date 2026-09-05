/**
 * Per-request Content-Security-Policy.
 *
 * Must wrap `next()` so it sees HTML after grok-pwa head injection, then
 * stamps a nonce onto every <script> and sets the header. Filename sorts
 * before grok-pwa.ts / request-guard.ts so this middleware is outermost.
 */
import {
  applyScriptNonces,
  buildContentSecurityPolicy,
  generateNonce,
  isHtmlResponse,
} from "../../scripts/csp.mjs";

interface CspEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function cspMiddleware(
  _event: CspEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const nonce = generateNonce();
  const result = await next();
  if (!(result instanceof Response)) return result;

  const headers = new Headers(result.headers);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));

  if (!isHtmlResponse(headers.get("content-type")) || !result.body) {
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }

  const stamped = applyScriptNonces(await result.text(), nonce);
  headers.delete("content-length");
  return new Response(stamped, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
