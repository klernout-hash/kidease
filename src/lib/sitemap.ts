/**
 * Canonical www sitemap. Static marketing pages plus public listing URLs.
 * Listing files stay at LISTING_SITEMAP_CAP urls each; overflow is a
 * sitemap index at /sitemap-listings.xml → /sitemap-listings-N.xml.
 * QA ghost / admin-only slugs never appear.
 */

import { isAdminOnlyListing } from "./listing-visibility.ts";
import { normalizeListingSlug } from "./listing-slug.ts";

export const SITEMAP_ORIGIN = "https://www.kidease.ca";
export const SITEMAP_LISTING_CAP = 500;
/** URLs per listing sitemap file (Google allows 50_000; keep files small). */
export const LISTING_SITEMAP_CAP = 5000;
/** Hard stop for the bundled slug list — Google's per-sitemap URL ceiling. */
export const LISTING_SITEMAP_TOTAL_CAP = 50_000;
export const SITEMAP_LISTINGS_PATH = "/sitemap-listings.xml";
export const SITEMAP_LASTMOD = "2026-09-08";
const BLOCKED_SITEMAP_SLUGS = new Set(["test-ghost-claim-lab"]);
const LISTING_SITEMAP_PAGE_RE = /^\/sitemap-listings-([1-9]\d*)\.xml$/;

export const SITEMAP_STATIC_PATHS = [
  "/",
  "/privacy",
  "/cookies",
  "/terms",
  "/login",
  "/about",
  "/verify",
  "/search",
  "/contact",
  "/help",
  "/team",
  "/benefits",
  "/faq",
  "/tour-checklist",
  "/get-app",
  "/claim",
  "/compare",
  "/unsubscribe",
] as const;

/** Marketing pages plus generated city hubs. Hubs are passed in by write-sitemap. */
export function sitemapPublicPaths(extraPaths: readonly string[] = []) {
  const seen = new Set<string>(SITEMAP_STATIC_PATHS);
  const out: string[] = [...SITEMAP_STATIC_PATHS];
  for (const path of extraPaths) {
    const clean = path.startsWith("/") ? path : `/${path}`;
    if (!clean || seen.has(clean)) continue;
    if (!clean.startsWith("/daycare/city/")) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function isSafeSitemapSlug(slug: string | null | undefined): boolean {
  const value = (slug || "").trim();
  if (!value || value.length > 80) return false;
  if (!SLUG_RE.test(value)) return false;
  return !BLOCKED_SITEMAP_SLUGS.has(value.toLowerCase());
}

export function sitemapListingPath(slug: string): string {
  return `/daycare/${slug}`;
}

export function publicSitemapSlugs(
  rows: Array<{
    id?: string | null;
    slug?: string | null;
    name?: string | null;
    licenseNumber?: string | null;
    address?: string | null;
    visibility?: string | null;
    isTest?: boolean | number | null;
  }>,
  cap = SITEMAP_LISTING_CAP,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const slug = normalizeListingSlug((row.slug || "").trim());
    if (!isSafeSitemapSlug(slug)) continue;
    if (isAdminOnlyListing(row)) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slug);
    if (out.length >= cap) break;
  }
  return out;
}

function locFor(path: string): string {
  if (path === "/") return `${SITEMAP_ORIGIN}/`;
  return `${SITEMAP_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSitemapXml(input: {
  paths?: readonly string[];
  listingSlugs?: readonly string[];
  lastmod?: string;
}): string {
  const lastmod = input.lastmod || SITEMAP_LASTMOD;
  const urls: string[] = [];
  for (const path of input.paths ?? SITEMAP_STATIC_PATHS) {
    urls.push(locFor(path));
  }
  for (const slug of input.listingSlugs ?? []) {
    if (!isSafeSitemapSlug(slug)) continue;
    urls.push(locFor(sitemapListingPath(slug)));
  }
  const body = urls
    .map(
      (loc) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function listingSitemapPagePath(page: number): string {
  return `/sitemap-listings-${page}.xml`;
}

export function listingSitemapPageCount(total: number, pageSize = LISTING_SITEMAP_CAP): number {
  if (total <= 0) return 0;
  return Math.ceil(total / pageSize);
}

export function listingSitemapNeedsIndex(total: number, pageSize = LISTING_SITEMAP_CAP): boolean {
  return total > pageSize;
}

export function listingSitemapPageNumber(pathname: string | null | undefined): number | null {
  const path = String(pathname ?? "").split("?")[0] || "/";
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const match = LISTING_SITEMAP_PAGE_RE.exec(trimmed);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

export function isListingSitemapPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? "").split("?")[0] || "/";
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed === SITEMAP_LISTINGS_PATH || listingSitemapPageNumber(trimmed) != null;
}

function listingRowsFromUnknown(slugs: unknown): Array<{
  slug?: string | null;
  visibility?: string | null;
  isTest?: boolean | number | null;
}> {
  const rows: Array<{ slug?: string | null; visibility?: string | null; isTest?: boolean | number | null }> = [];
  if (!Array.isArray(slugs)) return rows;
  for (const entry of slugs) {
    if (typeof entry === "string") rows.push({ slug: entry });
    else if (entry && typeof entry === "object") {
      rows.push(entry as { slug?: string | null; visibility?: string | null; isTest?: boolean | number | null });
    }
  }
  return rows;
}

export function normalizeListingSitemapSlugs(
  slugs: unknown,
  cap = LISTING_SITEMAP_TOTAL_CAP,
): string[] {
  return publicSitemapSlugs(listingRowsFromUnknown(slugs), cap);
}

/**
 * Listing-only urlset, capped at one file. Never throws — crawlers get a
 * valid urlset even when the slug source is missing, corrupt, or empty.
 */
export function safeListingSitemapXml(slugs: unknown, lastmod = SITEMAP_LASTMOD): string {
  try {
    return renderSitemapXml({
      paths: [],
      listingSlugs: publicSitemapSlugs(listingRowsFromUnknown(slugs), LISTING_SITEMAP_CAP),
      lastmod,
    });
  } catch {
    return renderSitemapXml({ paths: [], listingSlugs: [], lastmod });
  }
}

export function renderListingSitemapIndexXml(pageCount: number, lastmod = SITEMAP_LASTMOD): string {
  const pages = Math.max(0, Math.floor(pageCount));
  const body = Array.from({ length: pages }, (_, i) => {
    const loc = `${SITEMAP_ORIGIN}${listingSitemapPagePath(i + 1)}`;
    return `  <sitemap>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

export function renderSitemapIndexXml(lastmod = SITEMAP_LASTMOD): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITEMAP_ORIGIN}/sitemap.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_ORIGIN}${SITEMAP_LISTINGS_PATH}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
</sitemapindex>
`;
}

/**
 * Serve /sitemap-listings.xml as a urlset when listings fit in one file,
 * or as a sitemap index when they overflow LISTING_SITEMAP_CAP.
 * /sitemap-listings-N.xml is always a urlset page (empty if out of range).
 * Unknown paths return null so the handler can fall through.
 */
export function listingSitemapXmlForPath(
  slugs: unknown,
  pathname: string,
  lastmod = SITEMAP_LASTMOD,
): string | null {
  try {
    const path = String(pathname ?? "").split("?")[0] || "/";
    const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    const all = normalizeListingSitemapSlugs(slugs);
    const pages = listingSitemapPageCount(all.length);

    if (trimmed === SITEMAP_LISTINGS_PATH) {
      if (listingSitemapNeedsIndex(all.length)) {
        return renderListingSitemapIndexXml(pages, lastmod);
      }
      return renderSitemapXml({ paths: [], listingSlugs: all, lastmod });
    }

    const page = listingSitemapPageNumber(trimmed);
    if (page == null) return null;
    if (pages === 0 || page > pages) {
      return renderSitemapXml({ paths: [], listingSlugs: [], lastmod });
    }
    const start = (page - 1) * LISTING_SITEMAP_CAP;
    return renderSitemapXml({
      paths: [],
      listingSlugs: all.slice(start, start + LISTING_SITEMAP_CAP),
      lastmod,
    });
  } catch {
    return renderSitemapXml({ paths: [], listingSlugs: [], lastmod });
  }
}
