/**
 * Refresh public/sitemap.xml with static pages + a capped public listing set.
 * Ghost / admin-only slugs are skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicSitemapSlugs, renderSitemapXml, SITEMAP_LISTING_CAP } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const centres = JSON.parse(readFileSync(join(root, "src/lib/data/centres.json"), "utf8"));
const extra = JSON.parse(readFileSync(join(root, "src/lib/data/centres-extra-1.json"), "utf8"));
const slugs = publicSitemapSlugs([...extra, ...centres], SITEMAP_LISTING_CAP);
const xml = renderSitemapXml({ listingSlugs: slugs, lastmod: "2026-09-07" });
writeFileSync(join(root, "public/sitemap.xml"), xml);
console.log(`wrote public/sitemap.xml (${slugs.length} listing URLs)`);
