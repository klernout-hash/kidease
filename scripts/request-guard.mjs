/**
 * Request-level decisions for Nitro `server/middleware/request-guard.ts`.
 *
 * TanStack Start in this repo has no `createStart({ requestMiddleware })`
 * wiring — `src/router.tsx` only builds the router, and function middleware
 * (`src/lib/auth/middleware.ts`) runs on server functions, not document GETs.
 * Nitro global middleware is the chokepoint that actually sees Host + path
 * on Vercel (vite.config.ts `serverDir: "./server"`).
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
 * Admin desks and their API. `/administrator` and `/provider` are not matched.
 */
export function isSensitiveDeskPath(pathname) {
  const path = normalizePath(pathname);
  return (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/admin-contracts" ||
    path.startsWith("/admin-contracts/") ||
    path === "/api/admin" ||
    path.startsWith("/api/admin/")
  );
}

function queryString(search) {
  const raw = String(search ?? "");
  if (!raw || raw === "?") return "";
  return raw.startsWith("?") ? raw : `?${raw}`;
}

/**
 * @param {{ host?: string | null, pathname?: string | null, search?: string | null }} input
 * @returns {{ action: "next" } | { action: "redirect", status: 302, location: string }}
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

  if (isVercelAppHost(input.host) && isSensitiveDeskPath(path)) {
    return {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}${path}${queryString(input.search)}`,
    };
  }

  return { action: "next" };
}
