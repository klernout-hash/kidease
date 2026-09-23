/**
 * Full public listing sitemap. Static marketing URLs stay in public/sitemap.xml.
 * Slugs are Vite-bundled (Vercel functions cannot read src/lib/data/*.json).
 * More than LISTING_SITEMAP_CAP listings → sitemap index + paginated urlsets.
 * Generation never throws — empty urlset on failure.
 */
import listingSlugs from "../../src/lib/data/sitemap-listing-slugs.json" with { type: "json" };
import {
  isListingSitemapPath,
  listingSitemapXmlForPath,
  mergeListingSitemapSlugs,
  safeListingSitemapXml,
  SITEMAP_LISTINGS_PATH,
} from "../../src/lib/sitemap.ts";

const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=3600",
};

const cachedXml = new Map<string, { at: number; xml: string }>();
const SLUG_TTL_MS = 10 * 60 * 1000;

let slugCache: { at: number; slugs: string[] } | null = null;

/** Bundled slugs, unioned with Neon public slugs when DATABASE_URL is set. */
export async function resolveListingSitemapSlugs(): Promise<string[]> {
  const bundled = listingSlugs as string[];
  const now = Date.now();
  if (slugCache && now - slugCache.at < SLUG_TTL_MS) return slugCache.slugs;
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    slugCache = { at: now, slugs: bundled };
    return bundled;
  }
  try {
    const { getSql } = await import("../../src/lib/db.ts");
    const { PUBLIC_LISTING_SQL } = await import("../../src/lib/listing-visibility.ts");
    const sql = await getSql();
    const rows = await sql.query<{ slug: string | null }>(
      `select slug from daycares where ${PUBLIC_LISTING_SQL}`,
    );
    const slugs = mergeListingSitemapSlugs(
      bundled,
      rows.map((row) => row.slug || ""),
    );
    slugCache = { at: now, slugs };
    return slugs;
  } catch {
    return bundled;
  }
}

export async function listingSitemapXml(pathname = SITEMAP_LISTINGS_PATH): Promise<string> {
  const now = Date.now();
  const cached = cachedXml.get(pathname);
  if (cached && now - cached.at < SLUG_TTL_MS) return cached.xml;
  const slugs = await resolveListingSitemapSlugs();
  const xml = listingSitemapXmlForPath(slugs, pathname) ?? safeListingSitemapXml([]);
  cachedXml.set(pathname, { at: now, xml });
  return xml;
}

interface SitemapEvent {
  url: URL;
  req: { method: string };
}

function xmlResponse(method: string, xml: string): Response {
  return new Response(method === "HEAD" ? null : xml, {
    status: 200,
    headers: XML_HEADERS,
  });
}

export default async function sitemapListingsMiddleware(
  event: SitemapEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  if (!isListingSitemapPath(event.url.pathname)) return next();
  try {
    return xmlResponse(method, await listingSitemapXml(event.url.pathname));
  } catch {
    return xmlResponse(method, safeListingSitemapXml([]));
  }
}
