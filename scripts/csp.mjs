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
 * style-src keeps 'unsafe-inline' for React style={{}} and component libraries.
 * That is the leftover health-check WARN. style-src-elem-only would break
 * Radix / Sonner injected <style> tags.
 */

export const CSP_SCRIPT_HOSTS = [
  "https://maps.googleapis.com",
  "https://js.stripe.com",
  "https://challenges.cloudflare.com",
  "https://us.i.posthog.com",
  "https://us-assets.i.posthog.com",
];

export const CSP_CONNECT_HOSTS = [
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
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

  const scriptSrc = ["'self'", `'nonce-${token}'`, "'strict-dynamic'", ...CSP_SCRIPT_HOSTS].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
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

/** Stamp nonce onto every <script> that does not already have one. */
export function applyScriptNonces(html, nonce) {
  const token = String(nonce ?? "").trim();
  if (!token) return String(html ?? "");
  return String(html ?? "").replace(/<script\b([^>]*)>/gi, (full, attrs) => {
    if (/\bnonce\s*=/i.test(attrs)) return full;
    return `<script nonce="${token}"${attrs}>`;
  });
}

export function isHtmlResponse(contentType) {
  return /text\/html/i.test(String(contentType ?? ""));
}
