/**
 * In-app path for a link opened in the iOS or Android shell.
 * Email, auth, and listing links on kidease.ca stay inside the web view.
 * No @/ imports. scripts/app-link.test.mjs loads this file in Node.
 */

const SITE_HOSTS = new Set(["www.kidease.ca", "kidease.ca"]);
const APP_SCHEMES = new Set(["kidease:", "ca.kidease.app:"]);

function safePath(pathname: string, search: string, hash: string): string | null {
  const path = `${pathname || "/"}${search}${hash}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}

/** Path to open inside the shell. Null for anything that is not a KidEase link. */
export function appLinkPath(raw: string | null | undefined): string | null {
  let url: URL;
  try {
    url = new URL(String(raw || ""));
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const protocol = url.protocol.toLowerCase();
  if (protocol === "https:") {
    if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return null;
    return safePath(url.pathname, url.search, url.hash);
  }
  if (!APP_SCHEMES.has(protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (!host || SITE_HOSTS.has(host)) return safePath(url.pathname, url.search, url.hash);
  if (host.includes(".")) return null;
  return safePath(`/${host}${url.pathname === "/" ? "" : url.pathname}`, url.search, url.hash);
}
