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
  safeListingSitemapXml,
  SITEMAP_LISTINGS_PATH,
} from "../../src/lib/sitemap.ts";

const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=3600",
};

const cachedXml = new Map<string, string>();

export function listingSitemapXml(pathname = SITEMAP_LISTINGS_PATH): string {
  const cached = cachedXml.get(pathname);
  if (cached) return cached;
  const xml = listingSitemapXmlForPath(listingSlugs, pathname) ?? safeListingSitemapXml([]);
  cachedXml.set(pathname, xml);
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
    return xmlResponse(method, listingSitemapXml(event.url.pathname));
  } catch {
    return xmlResponse(method, safeListingSitemapXml([]));
  }
}
