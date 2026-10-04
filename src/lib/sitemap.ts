/**
 * Canonical www sitemap. Static marketing pages, French official-language
 * counterparts, plus public listing URLs.
 * Listing files stay at LISTING_SITEMAP_CAP urls each; overflow is a
 * sitemap index at /sitemap-listings.xml → /sitemap-listings-N.xml.
 * QA ghost / admin-only slugs never appear.
 */

import { isPublicListing, looksLikeTestFixture, type ListingVisibilityInput } from "./listing-visibility.ts";
import { normalizeListingSlug } from "./listing-slug.ts";
import { SITEMAP_FR_PATHS } from "./locale-path.ts";

export const SITEMAP_ORIGIN = "https://www.kidease.ca";
export const SITEMAP_LISTING_CAP = 500;
/** URLs per listing sitemap file (Google allows 50_000; keep files small). */
export const LISTING_SITEMAP_CAP = 5000;
/** Hard stop for the bundled slug list — Google's per-sitemap URL ceiling. */
export const LISTING_SITEMAP_TOTAL_CAP = 50_000;
export const SITEMAP_LISTINGS_PATH = "/sitemap-listings.xml";
export const SITEMAP_LASTMOD = "2026-09-08";
const BLOCKED_SITEMAP_SLUGS = new Set(["test-ghost", "test-ghost-claim-lab"]);
const LISTING_SITEMAP_PAGE_RE = /^\/sitemap-listings-([1-9]\d*)\.xml$/;

export const SITEMAP_STATIC_PATHS = [
  "/",
  "/privacy",
  "/cookies",
  "/terms",
  "/login",
  "/about",
  "/donate",
  "/verify",
  "/daycare-requirements",
  "/search",
  "/cities",
  "/vacancy-index",
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
  "/delete-account",
  "/jobs",
  "/jobs/post",
  "/start-a-daycare",
  "/need-care-fast",
] as const;

function sitemapBasePaths() {
  return [...SITEMAP_STATIC_PATHS, ...SITEMAP_FR_PATHS];
}

/** Marketing pages plus generated city hubs. Hubs are passed in by write-sitemap. */
export function sitemapPublicPaths(extraPaths: readonly string[] = []) {
  const base = sitemapBasePaths();
  const seen = new Set<string>(base);
  const out: string[] = [...base];
  for (const path of extraPaths) {
    const clean = path.startsWith("/") ? path : `/${path}`;
    if (!clean || seen.has(clean)) continue;
    if (!clean.startsWith("/daycare/city/") && !clean.startsWith("/fr/daycare/city/")) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Catalogue slugs are alphanumeric plus hyphens. Repeated and trailing hyphens
 * are real (truncated registry names such as "la-bulle-de-lait-"). They are
 * still one path segment — no slash, space, or dot.
 */
const SLUG_RE = /^[a-z0-9]+(?:-*[a-z0-9]+)*-*$/i;

export function isSafeSitemapSlug(slug: string | null | undefined): boolean {
  const value = (slug || "").trim();
  if (!value || value.length > 80) return false;
  if (/^(null|undefined)$/i.test(value)) return false;
  if (!SLUG_RE.test(value)) return false;
  if (BLOCKED_SITEMAP_SLUGS.has(value.toLowerCase())) return false;
  if (looksLikeTestFixture({ slug: value })) return false;
  return true;
}

export function sitemapListingPath(slug: string): string {
  return `/daycare/${slug}`;
}

/** Same rows search keeps, as safe listing URLs. One slug per centre. */
export function publicSitemapSlugs(
  rows: readonly ListingVisibilityInput[],
  cap = SITEMAP_LISTING_CAP,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!isPublicListing(row)) continue;
    const slug = normalizeListingSlug((row.slug || "").trim());
    if (!isSafeSitemapSlug(slug)) continue;
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

function bareCataloguePath(path: string): string {
  return path.startsWith("/fr/") ? path.slice(3) : path;
}

function isCatalogueSitemapPath(path: string): boolean {
  const bare = bareCataloguePath(path);
  return bare.startsWith("/daycare/");
}

function hreflangXml(enPath: string): string {
  const en = locFor(enPath);
  const fr = locFor(`/fr${enPath === "/" ? "" : enPath}`);
  return `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/>
    <xhtml:link rel="alternate" hreflang="fr" href="${escapeXml(fr)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(en)}"/>`;
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
  const entries: string[] = [];
  for (const path of input.paths ?? sitemapBasePaths()) {
    const loc = locFor(path);
    const alt = isCatalogueSitemapPath(path) ? `\n${hreflangXml(bareCataloguePath(path))}` : "";
    entries.push(`  <url>
    <loc>${escapeXml(loc)}</loc>${alt}
    <lastmod>${lastmod}</lastmod>
  </url>`);
  }
  for (const slug of input.listingSlugs ?? []) {
    if (!isSafeSitemapSlug(slug)) continue;
    const path = sitemapListingPath(slug);
    entries.push(`  <url>
    <loc>${escapeXml(locFor(path))}</loc>
${hreflangXml(path)}
    <lastmod>${lastmod}</lastmod>
  </url>`);
  }
  const body = entries.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
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

/**
 * Bundled slugs plus any newer public Neon slugs. Order keeps the bundled
 * list first. Admin-only and unsafe slugs are dropped. `suppressed` slugs are
 * rows the database marked hidden, inactive, admin-only, or retired — they
 * leave even when the bundled file still lists them. A partial public Neon
 * read cannot drop a bundled slug that was not suppressed.
 */
export function mergeListingSitemapSlugs(
  bundled: readonly string[],
  extra: readonly string[],
  cap = LISTING_SITEMAP_TOTAL_CAP,
  suppressed: readonly string[] = [],
): string[] {
  const drop = new Set(
    suppressed.map((slug) => normalizeListingSlug(slug).toLowerCase()).filter(Boolean),
  );
  const keep = (slug: string) => {
    const key = normalizeListingSlug(slug).toLowerCase();
    return !key || !drop.has(key);
  };
  const bundledRows = bundled.filter(keep).map((slug) => ({ slug }));
  const bundledPublic = publicSitemapSlugs(bundledRows, cap);
  const merged = publicSitemapSlugs(
    [...bundledRows, ...extra.filter(keep).map((slug) => ({ slug }))],
    cap,
  );
  return merged.length >= bundledPublic.length ? merged : bundledPublic;
}

export function normalizeListingSitemapSlugs(
  slugs: unknown,
  cap = LISTING_SITEMAP_TOTAL_CAP,
): string[] {
  return publicSitemapSlugs(listingRowsFromUnknown(slugs), cap);
}

/**
 * Same slug set, same page contents, on every serverless instance.
 * Postgres does not promise row order, and each instance caches its own list.
 */
export function stableListingSitemapSlugs(slugs: readonly string[]): string[] {
  return [...slugs].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));
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
    const all = stableListingSitemapSlugs(normalizeListingSitemapSlugs(slugs));
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
