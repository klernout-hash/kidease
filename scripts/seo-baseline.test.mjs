import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const robots = readFileSync(join(root, "public/robots.txt"), "utf8");
const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
const security = readFileSync(join(root, "public/.well-known/security.txt"), "utf8");

const PUBLIC_PATHS = [
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
];

test("robots.txt keeps admin disallows and points Sitemap at the www URL", () => {
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/admin-contracts$/m);
  assert.match(robots, /^Disallow: \/admin-chat$/m);
  assert.match(robots, /^Disallow: \/support$/m);
  assert.match(robots, /^Disallow: \/provider\/subscription$/m);
  assert.match(robots, /^Disallow: \/daycare\/test-ghost-claim-lab$/m);
  assert.match(robots, /^Disallow: \/book\/test-ghost-claim-lab$/m);
  assert.match(robots, /^Sitemap: https:\/\/www\.kidease\.ca\/sitemap\.xml$/m);
  assert.match(robots, /^Sitemap: https:\/\/www\.kidease\.ca\/sitemap-listings\.xml$/m);
  assert.doesNotMatch(robots, /Sitemap: https:\/\/kidease\.ca\/sitemap\.xml/);
});

test("sitemap.xml lists canonical www public pages and omits admin paths", () => {
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  for (const path of PUBLIC_PATHS) {
    const loc = `https://www.kidease.ca${path === "/" ? "/" : path}`;
    assert.match(sitemap, new RegExp(`<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`));
  }
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/daycare\//);
  assert.doesNotMatch(sitemap, /https:\/\/kidease\.ca\//);
  assert.doesNotMatch(sitemap, /\/admin/);
  assert.doesNotMatch(sitemap, /\/provider\/subscription/);
  assert.doesNotMatch(sitemap, /test-ghost-claim-lab/);
});

test("vercel CSP does not allowlist grok.com and still keeps product hosts", () => {
  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert.doesNotMatch(vercel, /Content-Security-Policy/);
  assert.doesNotMatch(vercel, /unsafe-inline/);
  assert.doesNotMatch(vercel, /grok\.com/);
  assert.match(vercel, /"source": "\/admin-chat"/);
  assert.match(vercel, /"source": "\/daycare\/test-ghost-claim-lab"/);
  assert.match(vercel, /"source": "\/book\/test-ghost-claim-lab"/);
});

test("sitemap generation includes public listing URLs and drops the ghost", async () => {
  const { publicSitemapSlugs, renderSitemapXml, isSafeSitemapSlug } = await import("../src/lib/sitemap.ts");
  assert.equal(isSafeSitemapSlug("test-ghost-claim-lab"), false);
  const slugs = publicSitemapSlugs(
    [
      { slug: "test-ghost-claim-lab", visibility: "admin_only", isTest: true },
      { slug: "leftover-qa", name: "TEST Extra Claim Lab" },
      { slug: "not a slug" },
      { slug: "sunny-side-child-care" },
    ],
    50,
  );
  assert.deepEqual(slugs, ["sunny-side-child-care"]);
  const xml = renderSitemapXml({ listingSlugs: slugs });
  assert.match(xml, /https:\/\/www\.kidease\.ca\/daycare\/sunny-side-child-care/);
  assert.doesNotMatch(xml, /test-ghost-claim-lab/);
  const middleware = readFileSync(join(root, "server/middleware/sitemap.ts"), "utf8");
  assert.match(middleware, /SITEMAP_LISTINGS_PATH/);
  assert.match(middleware, /publicSitemapSlugs/);
});

test("security.txt is RFC 9116-ish and lives at /.well-known/security.txt", () => {
  assert.equal(existsSync(join(root, "public/.well-known/security.txt")), true);
  assert.match(security, /^Contact: mailto:support@kidease\.ca$/m);
  assert.match(security, /^Preferred-Languages: en, fr$/m);
  assert.match(security, /^Canonical: https:\/\/www\.kidease\.ca\/\.well-known\/security\.txt$/m);
  assert.match(security, /^Expires: 2027-09-05T00:00:00\.000Z$/m);
});
