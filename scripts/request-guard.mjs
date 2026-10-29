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
/** Password managers land here; the in-app form is /forgot-password. */
export const CHANGE_PASSWORD_DESTINATION = "/forgot-password";

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
 * Staff desks and their API. `/administrator`, `/help`, `/provider`, `/parent`,
 * `/login`, `/api/auth/*`, and `/_serverFn/*` are not matched — Cloudflare
 * Access must stay on these staff prefixes only (see docs/cloudflare.md).
 * `/support*` is the Support desk (Access can be added later on www — see docs/support.md).
 */
/** Document paths that must send X-Robots-Tag instead of a robots.txt Disallow line. */
export function isAdminNoindexPath(pathname) {
  const path = normalizePath(pathname);
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-");
}

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

/**
 * Store-review sample. A direct /daycare/:slug (and /fr/daycare/:slug) is a
 * real page. Other QA prefixes stay 404 for guests. Search still excludes it.
 */
export const DIRECT_DEMO_LISTING_SLUGS = ["qa-reviewer-demo-centre"];

/** Public document prefixes that take a centre slug. */
const LISTING_DOCUMENT_PREFIXES = ["/daycare/", "/book/"];

/** QA / ghost slugs that must never render a public listing document. */
export function isHiddenListingSlug(slug) {
  const s = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");
  if (!s) return false;
  if (HIDDEN_LISTING_SLUGS.includes(s)) return true;
  if (s === "test-ghost" || s.startsWith("test-ghost-")) return true;
  if (s.startsWith("ke-test-")) return true;
  if (s.includes("ghost-listing")) return true;
  // Case-insensitive QA prefixes. Keep "teston-…" public (no separator after test).
  if (/^test([_-]|$)/i.test(s) || /^qa[_-]/i.test(s) || s === "qa") return true;
  return false;
}

/**
 * Published `/daycare/city/:slug` hubs. Canada catalogue only.
 * Anything else (US cities such as new-york, unknown slugs, non-hub
 * Canadian cities) is a document 404. The SPA must not answer 200 and
 * then paint Winnipeg search.
 */
export const PUBLISHED_CITY_HUB_SLUGS = [
  "toronto",
  "montreal",
  "vancouver",
  "calgary",
  "edmonton",
  "ottawa",
  "winnipeg",
  "quebec-city",
  "hamilton",
  "halifax",
  "moncton",
];

const PUBLISHED_CITY_HUB_SLUG_SET = new Set(PUBLISHED_CITY_HUB_SLUGS);

/** Single-segment slug under `/daycare/city/` or `/fr/daycare/city/`. */
export function cityHubSlugFromPath(pathname) {
  const path = normalizePath(pathname).toLowerCase();
  const bare = path.startsWith("/fr/") ? path.slice(3) : path;
  const prefix = "/daycare/city/";
  if (!bare.startsWith(prefix)) return null;
  const slug = bare.slice(prefix.length);
  if (!slug || slug.includes("/")) return null;
  return slug;
}

/** True for hub URLs that are not a published Canadian directory. */
export function isOffScopeCityHubPath(pathname) {
  const slug = cityHubSlugFromPath(pathname);
  if (!slug) return false;
  return !PUBLISHED_CITY_HUB_SLUG_SET.has(slug);
}

export function isDirectDemoListingPath(pathname) {
  const path = normalizePath(pathname).toLowerCase();
  const bare = path.startsWith("/fr/") ? path.slice(3) : path;
  if (!bare.startsWith("/daycare/")) return false;
  const slug = bare.slice("/daycare/".length).replace(/\/+$/, "");
  return DIRECT_DEMO_LISTING_SLUGS.includes(slug);
}

export function isHiddenListingPath(pathname) {
  if (isDirectDemoListingPath(pathname)) return false;
  const path = normalizePath(pathname).toLowerCase();
  const bare = path.startsWith("/fr/") ? path.slice(3) : path;
  for (const prefix of LISTING_DOCUMENT_PREFIXES) {
    if (!bare.startsWith(prefix)) continue;
    const slug = bare.slice(prefix.length);
    if (isHiddenListingSlug(slug)) return true;
  }
  return false;
}

export function isApexKideaseHost(hostHeader) {
  return hostnameOf(hostHeader) === "kidease.ca";
}

function isSafeDocumentMethod(method) {
  const verb = String(method || "GET").toUpperCase();
  return verb === "GET" || verb === "HEAD";
}

/** Keep AASA / assetlinks and auth APIs on the host that received them. */
export function shouldCanonicalizeApexPath(pathname) {
  const path = normalizePath(pathname);
  if (path.startsWith("/.well-known")) return false;
  // Apple's root AASA fallback must 200 on the host that received it (no 308).
  if (path === "/apple-app-site-association") return false;
  if (path.startsWith("/api/")) return false;
  if (path === "/ingest" || path.startsWith("/ingest/")) return false;
  return true;
}

const SESSION_COOKIE_RE =
  /(?:^|;\s*)(?:__Host-grok-auth\.session_token|__Secure-kidease\.session_token)=([^;]*)/;

/** A real sign-in cookie. Empty values do not count. */
export function hasAuthSessionCookie(cookieHeader) {
  const match = SESSION_COOKIE_RE.exec(String(cookieHeader || ""));
  if (!match) return false;
  let value = match[1] || "";
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep the raw value */
  }
  return value.trim().length > 8;
}

/** Styled document for a guard 404. Same words as the in-app not-found page. */
export function notFoundDocument(kind = "page") {
  const listing = kind === "listing";
  const title = listing ? "Listing not found" : "Page not found";
  const body = listing
    ? "This centre is not on KidEase, or the link is out of date."
    : "This page is not on KidEase, or the link is out of date.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>${title} · KidEase</title>
<style>
  body{margin:0;min-height:100dvh;background:#f6f3ee;color:#1c2438;font-family:"Plus Jakarta Sans",Segoe UI,sans-serif}
  header{border-bottom:1px solid #e4ddd2;padding:max(12px,env(safe-area-inset-top)) 20px}
  main{max-width:32rem;margin:0 auto;padding:64px 20px}
  h1{font-size:1.75rem;line-height:1.2;margin:0 0 8px}
  p{color:#5c6578;line-height:1.5}
  a{display:inline-flex;min-height:44px;align-items:center;margin-right:12px;font-weight:600;color:#1a3790}
</style>
</head>
<body>
<header><a href="/" style="font-weight:700;color:#1c2438;text-decoration:none">KidEase</a></header>
<main>
  <h1>${title}</h1>
  <p>${body}</p>
  <p><a href="/search">Search daycares</a><a href="/">Go home</a></p>
</main>
</body>
</html>`;
}

/**
 * @param {{ host?: string | null, pathname?: string | null, search?: string | null, method?: string | null, cookie?: string | null }} input
 * @returns {{ action: "next" } | { action: "redirect", status: 301 | 302 | 308, location: string } | { action: "not_found", status: 404 }}
 */
export function decideRequest(input = {}) {
  const path = normalizePath(input.pathname);

  if (path === "/for-daycares") {
    return { action: "redirect", status: 301, location: "/claim" };
  }

  const authAlias = {
    "/sign-in": "/login",
    "/sign-up": "/signup",
    "/fr/sign-in": "/fr/login",
    "/fr/sign-up": "/fr/signup",
  };
  if (authAlias[path]) {
    return { action: "redirect", status: 301, location: `${authAlias[path]}${queryString(input.search)}` };
  }

  if (path === CHANGE_PASSWORD_PATH) {
    return {
      action: "redirect",
      status: 302,
      location: CHANGE_PASSWORD_DESTINATION,
    };
  }

  if (isHiddenListingPath(path)) {
    if (hasAuthSessionCookie(input.cookie)) return { action: "next" };
    return { action: "not_found", status: 404 };
  }

  if (isOffScopeCityHubPath(path)) {
    return { action: "not_found", status: 404 };
  }

  if (isVercelAppHost(input.host) && isSensitiveDeskPath(path)) {
    return {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}${path}${queryString(input.search)}`,
    };
  }

  if (
    isApexKideaseHost(input.host) &&
    isSafeDocumentMethod(input.method) &&
    shouldCanonicalizeApexPath(path)
  ) {
    return {
      action: "redirect",
      status: 308,
      location: `${CANONICAL_ORIGIN}${path}${queryString(input.search)}`,
    };
  }

  return { action: "next" };
}
