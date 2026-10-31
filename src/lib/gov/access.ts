/**
 * Government desk isolation. Pure rules so tests do not need a database.
 * Government users stay on /gov. They do not open parent, daycare, or admin APIs.
 * Those roles do not open government APIs.
 */

export type GovApiZone = "public" | "parent" | "provider" | "admin" | "government";

const PARENT_API = [
  "/api/family-documents",
  "/api/search-alerts",
  "/api/spot-offers",
  "/api/referrals",
];

const PROVIDER_API = [
  "/api/screening-documents",
  "/api/license-docs",
  "/api/open-spots-checkin",
  "/api/tour-holds",
];

export function bareGovPath(raw: string | null | undefined): string {
  const trimmed = String(raw || "").trim();
  const path = (trimmed.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/fr") return "/";
  if (path.startsWith("/fr/")) return path.slice(3) || "/";
  return path;
}

export function isGovPortalPath(raw: string | null | undefined): boolean {
  const path = bareGovPath(raw);
  return path === "/gov" || path.startsWith("/gov/");
}

export function isGovLoginPath(raw: string | null | undefined): boolean {
  const path = bareGovPath(raw);
  return path === "/gov/login";
}

/** Paths that must never appear in the public sitemap. */
export const GOV_SITEMAP_PATHS = ["/gov", "/gov/login", "/fr/gov", "/fr/gov/login"] as const;

export function apiZoneForPath(raw: string | null | undefined): GovApiZone {
  const path = (String(raw || "").split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/api/gov" || path.startsWith("/api/gov/")) return "government";
  if (path === "/api/admin" || path.startsWith("/api/admin/") || path.startsWith("/api/admin.")) return "admin";
  if (PARENT_API.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`))) {
    return "parent";
  }
  if (PROVIDER_API.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`))) {
    return "provider";
  }
  if (path.startsWith("/api/contracts")) return "provider";
  return "public";
}

export function roleMayEnterZone(role: string | null | undefined, zone: GovApiZone): boolean {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (zone === "public") return true;
  if (zone === "government") return value === "government";
  if (value === "government") return false;
  if (zone === "admin") return value === "admin";
  if (zone === "provider") return value === "provider" || value === "admin";
  if (zone === "parent") return value === "parent" || value === "provider" || value === "admin";
  return false;
}

export function showGovFooterLink(input: { enabled: boolean; native: boolean }): boolean {
  return input.enabled === true && input.native !== true;
}

/** Native shells do not open this desk. The website does. */
export function govNativeBlocked(native: boolean): boolean {
  return native === true;
}
