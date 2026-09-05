/**
 * Request-level decisions for Nitro `server/middleware/request-guard.ts`.
 *
 * TanStack Start in this repo has no `createStart({ requestMiddleware })`
 * wiring — `src/router.tsx` only builds the router, and function middleware
 * (`src/lib/auth/middleware.ts`) runs on server functions, not document GETs.
 * Nitro global middleware is the chokepoint that actually sees Host + path
 * on Vercel (vite.config.ts `serverDir: "./server"`). Document GETs for the
 * QA ghost listing are 404'd here so the SPA shell cannot return HTTP 200.
 */

export const CANONICAL_ORIGIN = "https://www.kidease.ca";
export const CHANGE_PASSWORD_PATH = "/.well-known/change-password";
/** No in-app change-password page exists; forgot-password lives on /login. */
export const CHANGE_PASSWORD_DESTINATION = "/login";

export function hostnameOf(hostHeader) {
  const first = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!first) return "";
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end >= 0 ? first.slice(1, end) : first;
  }
  return first.split(":")[0] ?? "";
}

/** True for Vercel system hostnames, including kidease-git.vercel.app. */
export function isVercelAppHost(hostHeader) {
  const host = hostnameOf(hostHeader);
  return host === "vercel.app" || host.endsWith(".vercel.app");
}

export function normalizePath(pathname) {
  const raw = String(pathname ?? "").split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

/**
 * Staff desks and their API. `/administrator`, `/help`, and `/provider` are not matched.
 * `/support*` is the Support desk (Access can be added later on www — see docs/support.md).
 */
export function isSensitiveDeskPath(pathname) {
  const path = normalizePath(pathname);
  return (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/admin-contracts" ||
    path.startsWith("/admin-contracts/") ||
    path === "/admin-chat" ||
    path.startsWith("/admin-chat/") ||
    path === "/api/admin" ||
    path.startsWith("/api/admin/") ||
    path === "/support" ||
    path.startsWith("/support/")
  );
}

function queryString(search) {
  const raw = String(search ?? "");
  if (!raw || raw === "?") return "";
  return raw.startsWith("?") ? raw : `?${raw}`;
}

/**
 * QA fixture slugs that must not serve a public document. Keep in sync with
 * GHOST_LISTING / listing-visibility.ts (scripts/listing-visibility.test.mjs
 * tripwires both sides). Listing *data* is already admin-gated; this is the
 * HTTP chokepoint so `/daycare/test-ghost-claim-lab` is not a public 200.
 *
 * Authenticated admin can still load the listing via getDaycare after a
 * same-origin SPA navigation from /admin. Checking admin here would pull
 * Better Auth + Postgres into this tiny Nitro guard — not clean.
 */
export const HIDDEN_LISTING_SLUGS = ["test-ghost-claim-lab", "ke-test-ghost-001"];

/** Public document prefixes that take a centre slug. */
const LISTING_DOCUMENT_PREFIXES = ["/daycare/", "/book/"];

export function isHiddenListingPath(pathname) {
  const path = normalizePath(pathname).toLowerCase();
  for (const prefix of LISTING_DOCUMENT_PREFIXES) {
    if (!path.startsWith(prefix)) continue;
    const slug = path.slice(prefix.length);
    if (HIDDEN_LISTING_SLUGS.includes(slug)) return true;
  }
  return false;
}

/**
 * @param {{ host?: string | null, pathname?: string | null, search?: string | null }} input
 * @returns {{ action: "next" } | { action: "redirect", status: 302, location: string } | { action: "not_found", status: 404 }}
 */
export function decideRequest(input = {}) {
  const path = normalizePath(input.pathname);

  if (path === CHANGE_PASSWORD_PATH) {
    return {
      action: "redirect",
      status: 302,
      location: CHANGE_PASSWORD_DESTINATION,
    };
  }

  if (isHiddenListingPath(path)) {
    return { action: "not_found", status: 404 };
  }

  if (isVercelAppHost(input.host) && isSensitiveDeskPath(path)) {
    return {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}${path}${queryString(input.search)}`,
    };
  }

  return { action: "next" };
}
