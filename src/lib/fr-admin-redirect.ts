/**
 * There is no French admin desk. `/fr/admin`, `/fr/admin?tab=…`, `/fr/admin/…` and
 * `/fr/admin-…` go to the same English admin path and query, instead of crashing
 * (AdminPage reads the `/admin` route's search) or showing a 404.
 * No app imports, so node tests load this file directly.
 */
export function frAdminRedirectHref(pathname: string, searchStr = ""): string | null {
  const m = /^\/fr(\/admin(?:[-/_][^?#]*)?)\/?$/.exec(pathname || "");
  if (!m) return null;
  const path = m[1].replace(/\/+$/, "") || "/admin";
  const search = searchStr && searchStr !== "?" ? (searchStr.startsWith("?") ? searchStr : `?${searchStr}`) : "";
  return `${path}${search}`;
}
