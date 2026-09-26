/**
 * CDN cache for public catalogue / listing JSON only.
 * HTML documents stay max-age=0 (hashed /assets). Authenticated server
 * functions are not listed here.
 */
import { CATALOGUE_FN_IDS, LISTING_FN_IDS } from "./server-fn-ids.mjs";

export { LISTING_FN_IDS };

export const PUBLIC_CATALOGUE_CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

export const SESSION_COOKIE_NAMES = [
  "__Host-grok-auth.session_token",
  "__Secure-kidease.session_token",
];

export function serverFnIdFromPath(pathname) {
  const path = String(pathname || "");
  const marker = "/_serverFn/";
  const at = path.indexOf(marker);
  if (at < 0) return "";
  const rest = path.slice(at + marker.length).split("/")[0] ?? "";
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

export function hasSessionCookie(cookieHeader) {
  const raw = String(cookieHeader || "");
  return SESSION_COOKIE_NAMES.some((name) => raw.includes(`${name}=`));
}

export function listingBodyIsPublic(body) {
  const text = String(body || "");
  if (!text.includes('"s":"public"')) return false;
  if (text.includes('"admin_only"')) return false;
  if (text.includes("test-ghost")) return false;
  if (text.includes("ke-test-")) return false;
  return true;
}

/**
 * @returns {string | null} Cache-Control value, or null to leave the response alone.
 */
export function catalogueCacheControl(input) {
  const method = String(input.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  if (input.status !== 200) return null;
  if (input.setCookie) return null;
  const existing = String(input.cacheControl || "").toLowerCase();
  if (existing.includes("no-store") || existing.includes("private")) return null;

  const id = serverFnIdFromPath(input.pathname);
  if (!id) return null;
  if (CATALOGUE_FN_IDS.has(id)) return PUBLIC_CATALOGUE_CACHE_CONTROL;
  if (!LISTING_FN_IDS.has(id)) return null;
  if (hasSessionCookie(input.cookie)) return null;
  if (!listingBodyIsPublic(input.bodyText)) return null;
  return PUBLIC_CATALOGUE_CACHE_CONTROL;
}
