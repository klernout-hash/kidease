/**
 * Full public listing sitemap. Static marketing URLs stay in public/sitemap.xml.
 * Slugs are Vite-bundled (Vercel functions cannot read src/lib/data/*.json).
 * Generation is capped; the handler never throws — empty urlset on failure.
 */
import listingSlugs from "../../src/lib/data/sitemap-listing-slugs.json" with { type: "json" };
import {
  safeListingSitemapXml,
  SITEMAP_LISTINGS_PATH,
} from "../../src/lib/sitemap.ts";

const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=3600",
};

let cachedXml: string | null = null;

export function listingSitemapXml(): string {
  if (cachedXml) return cachedXml;
  cachedXml = safeListingSitemapXml(listingSlugs);
  return cachedXml;
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
  if (event.url.pathname !== SITEMAP_LISTINGS_PATH) return next();
  try {
    return xmlResponse(method, listingSitemapXml());
  } catch {
    return xmlResponse(method, safeListingSitemapXml([]));
  }
}
