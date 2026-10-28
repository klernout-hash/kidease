/**
 * Edge cache for anonymous public documents that do not depend on a session.
 * Browsers still revalidate (max-age=0). Cloudflare / Vercel may keep a copy
 * for an hour and serve a stale copy for a day while they refresh.
 */

export const PUBLIC_STATIC_EDGE_CACHE =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

const EXACT = new Set([
  "/privacy",
  "/fr/privacy",
  "/contact",
  "/fr/contact",
  "/unsubscribe",
  "/fr/unsubscribe",
  "/delete-account",
  "/fr/delete-account",
]);

export function normalizePublicPath(pathname) {
  const raw = String(pathname || "/").split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

export function isPublicStaticDocument(pathname) {
  const path = normalizePublicPath(pathname);
  if (EXACT.has(path)) return true;
  return /^\/(?:fr\/)?daycare\/city\/[^/]+$/.test(path);
}

function hasSessionCookie(cookie) {
  const raw = String(cookie || "");
  return (
    raw.includes("__Host-grok-auth.session_token=") ||
    raw.includes("__Secure-kidease.session_token=") ||
    raw.includes("kidease.e2e_session=")
  );
}

export function publicStaticCacheControl(input = {}) {
  const method = String(input.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (input.status != null && Number(input.status) !== 200) return null;
  if (input.setCookie) return null;
  if (hasSessionCookie(input.cookie)) return null;
  if (!isPublicStaticDocument(input.pathname)) return null;
  return PUBLIC_STATIC_EDGE_CACHE;
}

export function applyPublicStaticCache(headers, input) {
  const value = publicStaticCacheControl(input);
  if (!value) return false;
  headers.set("Cache-Control", value);
  headers.set("CDN-Cache-Control", value);
  headers.set("Cloudflare-CDN-Cache-Control", value);
  return true;
}
