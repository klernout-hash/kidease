/**
 * Full public listing sitemap. Static marketing URLs stay in public/sitemap.xml.
 * This path is not a committed 20k-URL file — generate on request, capped.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  publicSitemapSlugs,
  renderSitemapXml,
  SITEMAP_LISTINGS_PATH,
} from "../../src/lib/sitemap";

const LISTING_SITEMAP_CAP = 5000;
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

let cachedXml: string | null = null;

function listingSitemapXml(): string {
  if (cachedXml) return cachedXml;
  const centres = JSON.parse(readFileSync(join(root, "src/lib/data/centres.json"), "utf8")) as Array<{
    slug?: string;
    visibility?: string | null;
    isTest?: boolean | number | null;
  }>;
  const slugs = publicSitemapSlugs(centres, LISTING_SITEMAP_CAP);
  cachedXml = renderSitemapXml({ paths: [], listingSlugs: slugs, lastmod: "2026-09-07" });
  return cachedXml;
}

interface SitemapEvent {
  url: URL;
  req: { method: string };
}

export default async function sitemapListingsMiddleware(
  event: SitemapEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  if (event.url.pathname !== SITEMAP_LISTINGS_PATH) return next();
  const xml = listingSitemapXml();
  return new Response(method === "HEAD" ? null : xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
