/**
 * Refresh public/sitemap.xml with static pages + a capped public listing set,
 * and the slug list the listings sitemap middleware bundles on Vercel.
 * The listings file holds every public slug (up to LISTING_SITEMAP_TOTAL_CAP);
 * the middleware paginates at LISTING_SITEMAP_CAP. Ghost / admin-only slugs
 * are skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LISTING_SITEMAP_CAP,
  LISTING_SITEMAP_TOTAL_CAP,
  listingSitemapPageCount,
  publicSitemapSlugs,
  renderSitemapXml,
  SITEMAP_LASTMOD,
  SITEMAP_LISTING_CAP,
} from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const centres = JSON.parse(readFileSync(join(root, "src/lib/data/centres.json"), "utf8"));
const extra = JSON.parse(readFileSync(join(root, "src/lib/data/centres-extra-1.json"), "utf8"));
const rows = [...extra, ...centres];
const slugs = publicSitemapSlugs(rows, SITEMAP_LISTING_CAP);
const listingSlugs = publicSitemapSlugs(rows, LISTING_SITEMAP_TOTAL_CAP);
const xml = renderSitemapXml({ listingSlugs: slugs, lastmod: SITEMAP_LASTMOD });
writeFileSync(join(root, "public/sitemap.xml"), xml);
writeFileSync(join(root, "src/lib/data/sitemap-listing-slugs.json"), `${JSON.stringify(listingSlugs)}\n`);
const pages = listingSitemapPageCount(listingSlugs.length);
console.log(`wrote public/sitemap.xml (${slugs.length} listing URLs)`);
console.log(
  `wrote src/lib/data/sitemap-listing-slugs.json (${listingSlugs.length} slugs, ${pages} listing sitemap page${pages === 1 ? "" : "s"} of ${LISTING_SITEMAP_CAP})`,
);
