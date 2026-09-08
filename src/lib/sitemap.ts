/**
 * Canonical www sitemap. Static marketing pages plus a capped public listing
 * set. QA ghost / admin-only slugs never appear.
 */

import { isAdminOnlyListing } from "./listing-visibility.ts";

export const SITEMAP_ORIGIN = "https://www.kidease.ca";
export const SITEMAP_LISTING_CAP = 500;
export const SITEMAP_LISTINGS_PATH = "/sitemap-listings.xml";
const BLOCKED_SITEMAP_SLUGS = new Set(["test-ghost-claim-lab"]);

export const SITEMAP_STATIC_PATHS = [
  "/",
  "/privacy",
  "/cookies",
  "/terms",
  "/login",
  "/about",
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
    const slug = (row.slug || "").trim();
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
  const lastmod = input.lastmod || "2026-09-07";
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

export function renderSitemapIndexXml(lastmod = "2026-09-07"): string {
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
