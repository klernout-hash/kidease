/**
 * Full public listing sitemap. Static marketing URLs stay in public/sitemap.xml.
 * Slugs are Vite-bundled (Vercel functions cannot read src/lib/data/*.json).
 * A successful Neon read replaces that file with the same public rows search uses.
 * More than LISTING_SITEMAP_CAP listings → sitemap index + paginated urlsets.
 * Generation never throws — empty urlset on failure.
 */
import listingSlugs from "../../src/lib/data/sitemap-listing-slugs.json" with { type: "json" };
import {
  isListingSitemapPath,
  listingSitemapXmlForPath,
  LISTING_SITEMAP_TOTAL_CAP,
  publicSitemapSlugs,
  safeListingSitemapXml,
  stableListingSitemapSlugs,
  SITEMAP_LISTINGS_PATH,
} from "../../src/lib/sitemap.ts";

const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=3600",
};

const cachedXml = new Map<string, { at: number; xml: string }>();
const SLUG_TTL_MS = 10 * 60 * 1000;

let slugCache: { at: number; slugs: string[] } | null = null;

function bundledPublicSlugs(): string[] {
  return stableListingSitemapSlugs(
    publicSitemapSlugs((listingSlugs as string[]).map((slug) => ({ slug })), LISTING_SITEMAP_TOTAL_CAP),
  );
}

/**
 * Public Neon slugs when the database answers with at least one row.
 * That list is the whole public catalogue, so bundled copies are not added back.
 * An empty or failed read keeps the bundled public slugs.
 */
export async function resolveListingSitemapSlugs(): Promise<string[]> {
  const now = Date.now();
  if (slugCache && now - slugCache.at < SLUG_TTL_MS) return slugCache.slugs;
  const fallback = bundledPublicSlugs();
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    slugCache = { at: now, slugs: fallback };
    return fallback;
  }
  try {
    const { getSql } = await import("../../src/lib/db.ts");
    const { PUBLIC_LISTING_SQL } = await import("../../src/lib/listing-visibility.ts");
    const sql = await getSql();
    const rows = await sql.query<{
      slug: string | null;
      name: string | null;
      id: string | null;
      province: string | null;
      claim_status: string | null;
      fact_source: string | null;
      visibility: string | null;
      is_test: number | boolean | null;
      listing_active: number | boolean | null;
      merged_into: string | null;
      import_fault: string | null;
    }>(
      `select slug, name, id, province, claim_status, fact_source, visibility, is_test, listing_active, merged_into, import_fault
         from daycares
        where ${PUBLIC_LISTING_SQL}`,
    );
    if (rows.length === 0) {
      slugCache = { at: now, slugs: fallback };
      return fallback;
    }
    const slugs = stableListingSitemapSlugs(
      publicSitemapSlugs(
        rows.map((row) => ({
          slug: row.slug,
          name: row.name,
          id: row.id,
          province: row.province,
          claimStatus: row.claim_status,
          factSource: row.fact_source,
          visibility: row.visibility,
          isTest: row.is_test,
          listingActive: row.listing_active,
          mergedInto: row.merged_into,
          importFault: row.import_fault,
        })),
        LISTING_SITEMAP_TOTAL_CAP,
      ),
    );
    slugCache = { at: now, slugs };
    return slugs;
  } catch {
    return fallback;
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
  if (event.url.pathname === "/sitemap-age-vacancy.xml" || event.url.pathname === "/sitemap-age-vacancy.xml/") {
    try {
      const { ageVacancySitemapXml } = await import("../../src/lib/server/age-vacancy.ts");
      return xmlResponse(method, await ageVacancySitemapXml());
    } catch {
      const { renderAgeVacancySitemapXml } = await import("../../src/lib/age-vacancy.ts");
      return xmlResponse(method, renderAgeVacancySitemapXml([]));
    }
  }
  if (!isListingSitemapPath(event.url.pathname)) return next();
  try {
    return xmlResponse(method, await listingSitemapXml(event.url.pathname));
  } catch {
    return xmlResponse(method, safeListingSitemapXml([]));
  }
}
