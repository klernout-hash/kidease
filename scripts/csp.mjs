/**
 * Production CSP builder.
 *
 * Vercel static headers cannot vary a nonce per request, so the live policy is
 * set in `server/middleware/csp.ts` (Nitro). `vercel.json` must not also send
 * Content-Security-Policy — browsers enforce every CSP header, and a second
 * static policy without the nonce would block TanStack inline hydration.
 *
 * script-src uses a per-request nonce + 'strict-dynamic' so first-party HTML
 * scripts (channel-boot, TanStack <Scripts />) can load Maps / Stripe /
 * Turnstile / PostHog. Those SDKs append scripts with createElement.
 *
 * style-src is nonce-only (no 'unsafe-inline'). SSR <style> tags are stamped
 * after render. Radix / Sonner / Maps inject <style> at runtime — a nonce'd
 * boot script copies document.currentScript.nonce onto createElement("style").
 *
 * script-src includes 'wasm-unsafe-eval' so the listing-photo HEIC decoder
 * (libheif) can compile WebAssembly. That token does not allow eval or
 * new Function, and script-src still has no 'unsafe-inline'.
 *
 * style-src-attr keeps 'unsafe-inline' for React style={{}} (BrandMark pin,
 * Sonner, Floating UI / Radix position, dynamic meters, marketing mocks).
 * Attribute XSS is not a script gadget in current browsers; dropping this
 * would break TanStack / Radix without a CSS-variable rewrite of popovers.
 */

export const CSP_SCRIPT_HOSTS = [
  "https://maps.googleapis.com",
  "https://js.stripe.com",
  "https://challenges.cloudflare.com",
  "https://us.i.posthog.com",
  "https://us-assets.i.posthog.com",
];

/** Maps JS tiles/session also hit khms*.googleapis.com and tile.googleapis.com. */
export const CSP_CONNECT_HOSTS = [
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
  "https://*.googleapis.com",
  "https://*.gstatic.com",
  "https://tile.googleapis.com",
  "https://api.stripe.com",
  "https://*.kidease.ca",
  "https://kidease.ca",
  "https://challenges.cloudflare.com",
  "https://us.i.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
];

export const CSP_FRAME_HOSTS = [
  "https://js.stripe.com",
  "https://hooks.stripe.com",
  "https://challenges.cloudflare.com",
];

/** Public listing photos. Production is media.kidease.ca; r2.dev is optional/dev. */
export const CSP_IMG_HOSTS = [
  "https://media.kidease.ca",
  "https://pub-9e5f137809844fcdb6d6671cd909f312.r2.dev",
  "https://*.r2.dev",
];

/**
 * Classic script: copies its own nonce onto runtime <style> tags.
 * createElement covers Sonner. innerHTML / insertAdjacentHTML cover SDKs
 * that inject a style tag as HTML (Turnstile, maps). script-src stays strict.
 */
export const STYLE_NONCE_BOOT =
  '(function(){var n=document.currentScript&&document.currentScript.nonce;if(!n)return;var c=Document.prototype.createElement;var open="<"+"style";Document.prototype.createElement=function(t,o){var e=c.call(this,t,o);if(String(t).toLowerCase()==="style"){try{e.nonce=n}catch(err){}e.setAttribute("nonce",n)}return e;};function stamp(html){var s=String(html==null?"":html);if(s.toLowerCase().indexOf(open)<0)return s;return s.replace(new RegExp(open+"\\\\b([^>]*)>","gi"),function(full,attrs){if(/(?:^|\\s)nonce\\s*=/i.test(attrs))return full;return open+" nonce=\\""+n+"\\""+attrs+">";});}function patch(proto,key){var d;try{d=Object.getOwnPropertyDescriptor(proto,key);}catch(err){return;}if(!d||typeof d.set!="function"||typeof d.get!="function")return;Object.defineProperty(proto,key,{configurable:!0,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,stamp(v));}});}patch(Element.prototype,"innerHTML");patch(Element.prototype,"outerHTML");var ins=Element.prototype.insertAdjacentHTML;Element.prototype.insertAdjacentHTML=function(p,h){return ins.call(this,p,stamp(h));};})();';

export function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export function buildContentSecurityPolicy(nonce) {
  const token = String(nonce ?? "").trim();
  if (!token) throw new Error("CSP nonce is required");
  if (/['\s;]/.test(token)) throw new Error("CSP nonce contains unsafe characters");

  const scriptSrc = ["'self'", `'nonce-${token}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...CSP_SCRIPT_HOSTS].join(" ");
  const styleSrc = ["'self'", `'nonce-${token}'`].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${CSP_IMG_HOSTS.join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self' ${CSP_CONNECT_HOSTS.join(" ")}`,
    "worker-src 'self' blob: data:",
    `frame-src ${CSP_FRAME_HOSTS.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * A real nonce attribute. `\bnonce` is wrong here: the word boundary matches
 * the hyphen in `data-ke-style-nonce=""`, so the style boot script was left
 * without a nonce and the browser blocked it.
 */
function hasNonceAttribute(attrs) {
  return /(?:^|\s)nonce\s*=/i.test(String(attrs ?? ""));
}

/** Stamp nonce onto every <script> that does not already have one. */
export function applyScriptNonces(html, nonce) {
  const token = String(nonce ?? "").trim();
  if (!token) return String(html ?? "");
  return String(html ?? "").replace(/<script\b([^>]*)>/gi, (full, attrs) => {
    if (hasNonceAttribute(attrs)) return full;
    return `<script nonce="${token}"${attrs}>`;
  });
}

/** Stamp nonce onto every <style> that does not already have one. */
export function applyStyleNonces(html, nonce) {
  const token = String(nonce ?? "").trim();
  if (!token) return String(html ?? "");
  return String(html ?? "").replace(/<style\b([^>]*)>/gi, (full, attrs) => {
    if (hasNonceAttribute(attrs)) return full;
    return `<style nonce="${token}"${attrs}>`;
  });
}

/** Inject the runtime style-nonce boot as the first child of <head>. */
export function applyStyleNonceBoot(html, nonce) {
  const token = String(nonce ?? "").trim();
  const source = String(html ?? "");
  if (!token) return source;
  if (/\bdata-ke-style-nonce\b/.test(source)) return source;
  const tag = `<script data-ke-style-nonce nonce="${token}">${STYLE_NONCE_BOOT}</script>`;
  if (/<head\b/i.test(source)) {
    return source.replace(/<head\b[^>]*>/i, (open) => `${open}${tag}`);
  }
  return tag + source;
}

/**
 * Cloudflare Email Obfuscation injects /cdn-cgi/scripts/.../email-decode.min.js
 * without a nonce. strict-dynamic blocks that script, hydration breaks, and
 * the address stays scrambled. These comments are Cloudflare's per-page off switch.
 */
export function applyEmailObfuscationOff(html) {
  const source = String(html ?? "");
  if (source.includes("<!--email_off-->")) return source;
  let out = source;
  if (/<head\b/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (open) => `${open}<!--email_off-->`);
  } else {
    out = `<!--email_off-->${out}`;
  }
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, "<!--/email_off--></body>");
  } else {
    out += "<!--/email_off-->";
  }
  return out;
}

export function applyDocumentNonces(html, nonce) {
  return applyEmailObfuscationOff(
    applyStyleNonces(applyScriptNonces(applyStyleNonceBoot(html, nonce), nonce), nonce),
  );
}

export function isHtmlResponse(contentType) {
  return /text\/html/i.test(String(contentType ?? ""));
}

/** Documents must revalidate so HTML never points at deleted hashed /assets/*. */
export const HTML_DOCUMENT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export function applyHtmlDocumentCacheHeaders(headers) {
  headers.set("Cache-Control", HTML_DOCUMENT_CACHE_CONTROL);
  headers.set("CDN-Cache-Control", HTML_DOCUMENT_CACHE_CONTROL);
  headers.set("Cloudflare-CDN-Cache-Control", HTML_DOCUMENT_CACHE_CONTROL);
}
