/**
 * Government desk isolation. Pure rules so tests do not need a database.
 * Government users stay on /gov. They do not open parent, daycare, or admin APIs.
 * Those roles do not open government APIs.
 */

export type GovApiZone = "public" | "parent" | "provider" | "admin" | "government";

const PARENT_API = [
  "/api/family-documents",
  "/api/invoices",
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
export const GOV_SITEMAP_PATHS = ["/gov", "/gov/login", "/fr/gov", "/fr/gov/login", "/gov-terms"] as const;

/**
 * Match the installed Router's once-only pathname decoding before its default
 * case-insensitive static matching. Keep escaped percent/backslash sequences
 * intact; unrestricted or repeated decoding changes which routes can match.
 * The Router comparison tests guard this compatibility when dependencies change.
 */
export function canonicalApiPath(raw: string | null | undefined): string {
  let path = String(raw || "").split("?")[0] || "/";
  // eslint-disable-next-line no-control-regex -- Match the Router's path-data normalization.
  if (/[%\\\x00-\x1f\x7f]/.test(path)) {
    const segment = (value: string) => {
      let decoded: string;
      try { decoded = decodeURI(value); }
      catch {
        decoded = value.replace(/%[0-9A-F]{2}/gi, (part) => {
          try { return decodeURI(part); } catch { return part; }
        });
      }
      // eslint-disable-next-line no-control-regex -- Preserve the Router's control-character sanitizing behavior.
      return decoded.replace(/[\x00-\x1f\x7f"<>`{}]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
    };
    path = path.split(/(%25|%5C)/gi).map((part, index) => index % 2 ? part : segment(part)).join("");
  }
  return path.toLowerCase().replace(/\/+$/, "") || "/";
}

export function apiZoneForPath(raw: string | null | undefined): GovApiZone {
  const path = canonicalApiPath(raw);
  if (path === "/api/gov" || path.startsWith("/api/gov/")) return "government";
  if (path === "/api/admin" || path.startsWith("/api/admin/") || path.startsWith("/api/admin.")) return "admin";
  if (PARENT_API.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`))) {
    return "parent";
  }
  if (PROVIDER_API.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`))) {
    return "provider";
  }
  // The shared PDF URL also serves parent agreements. The handler checks the
  // stored pack kind and its record-specific permissions before loading bytes.
  if (/^\/api\/contracts\/[^/]+\/pdf$/.test(path)) return "parent";
  if (path.startsWith("/api/contracts")) return "provider";
  return "public";
}

export function privateHttpZoneForPath(raw: string | null | undefined): "parent" | "provider" | "admin" | null {
  const zone = apiZoneForPath(raw);
  return zone === "parent" || zone === "provider" || zone === "admin" ? zone : null;
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
