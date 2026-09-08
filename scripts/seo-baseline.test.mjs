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
  assert.match(middleware, /listingSitemapXmlForPath/);
  assert.match(middleware, /safeListingSitemapXml/);
  assert.match(middleware, /sitemap-listing-slugs\.json/);
  assert.doesNotMatch(middleware, /readFileSync/);
});

test("listing sitemap stays valid XML when slugs are missing or corrupt", async () => {
  const { safeListingSitemapXml } = await import("../src/lib/sitemap.ts");
  for (const source of [null, undefined, "nope", { slug: "x" }, [null, 1, { slug: "not a slug" }]]) {
    const xml = safeListingSitemapXml(source);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(xml, /<\/urlset>/);
    assert.doesNotMatch(xml, /<loc>/);
  }
  const xml = safeListingSitemapXml(["sunny-side-child-care", "test-ghost-claim-lab"]);
  assert.match(xml, /https:\/\/www\.kidease\.ca\/daycare\/sunny-side-child-care/);
  assert.doesNotMatch(xml, /test-ghost-claim-lab/);
});

test("listings sitemap paginates past the 5000-URL file cap", async () => {
  const {
    LISTING_SITEMAP_CAP,
    listingSitemapXmlForPath,
    listingSitemapNeedsIndex,
    listingSitemapPageCount,
    listingSitemapPagePath,
  } = await import("../src/lib/sitemap.ts");
  const overflow = Array.from({ length: LISTING_SITEMAP_CAP + 3 }, (_, i) => `public-centre-${i + 1}`);
  assert.equal(listingSitemapNeedsIndex(overflow.length), true);
  assert.equal(listingSitemapPageCount(overflow.length), 2);

  const index = listingSitemapXmlForPath(overflow, "/sitemap-listings.xml");
  assert.match(index, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(index, /https:\/\/www\.kidease\.ca\/sitemap-listings-1\.xml/);
  assert.match(index, /https:\/\/www\.kidease\.ca\/sitemap-listings-2\.xml/);
  assert.doesNotMatch(index, /<urlset /);

  const page1 = listingSitemapXmlForPath(overflow, listingSitemapPagePath(1));
  const page2 = listingSitemapXmlForPath(overflow, listingSitemapPagePath(2));
  assert.match(page1, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(page1, /https:\/\/www\.kidease\.ca\/daycare\/public-centre-1/);
  assert.match(page1, /https:\/\/www\.kidease\.ca\/daycare\/public-centre-5000/);
  assert.doesNotMatch(page1, /public-centre-5001/);
  assert.match(page2, /https:\/\/www\.kidease\.ca\/daycare\/public-centre-5001/);
  assert.match(page2, /https:\/\/www\.kidease\.ca\/daycare\/public-centre-5003/);
  assert.equal((page1.match(/<url>/g) || []).length, LISTING_SITEMAP_CAP);
  assert.equal((page2.match(/<url>/g) || []).length, 3);

  const empty = listingSitemapXmlForPath(overflow, "/sitemap-listings-9.xml");
  assert.match(empty, /<urlset /);
  assert.doesNotMatch(empty, /<loc>/);
  assert.equal(listingSitemapXmlForPath(overflow, "/robots.txt"), null);
});

test("listings sitemap middleware returns HTTP 200 XML without reading centres.json", async () => {
  const slugsPath = join(root, "src/lib/data/sitemap-listing-slugs.json");
  assert.equal(existsSync(slugsPath), true);
  const slugs = JSON.parse(readFileSync(slugsPath, "utf8"));
  assert.ok(Array.isArray(slugs) && slugs.length > 0);
  assert.ok(!slugs.includes("test-ghost-claim-lab"));

  const { LISTING_SITEMAP_CAP } = await import("../src/lib/sitemap.ts");
  const { default: sitemapListingsMiddleware, listingSitemapXml } = await import(
    "../server/middleware/sitemap.ts"
  );
  const xml = listingSitemapXml();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.doesNotMatch(xml, /test-ghost-claim-lab/);
  if (slugs.length > LISTING_SITEMAP_CAP) {
    assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.match(xml, /https:\/\/www\.kidease\.ca\/sitemap-listings-1\.xml/);
    const page1 = listingSitemapXml("/sitemap-listings-1.xml");
    assert.match(page1, /https:\/\/www\.kidease\.ca\/daycare\//);
    assert.match(page1, /<urlset /);
  } else {
    assert.match(xml, /https:\/\/www\.kidease\.ca\/daycare\//);
  }

  const passed = { next: false };
  const res = await sitemapListingsMiddleware(
    { url: new URL("https://www.kidease.ca/sitemap-listings.xml"), req: { method: "GET" } },
    () => {
      passed.next = true;
      return new Response("next");
    },
  );
  assert.equal(passed.next, false);
  assert.ok(res instanceof Response);
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("content-type")), /application\/xml/);
  const body = await res.text();
  assert.equal(body, xml);

  if (slugs.length > LISTING_SITEMAP_CAP) {
    const pageRes = await sitemapListingsMiddleware(
      { url: new URL("https://www.kidease.ca/sitemap-listings-1.xml"), req: { method: "GET" } },
      () => "fell-through",
    );
    assert.ok(pageRes instanceof Response);
    assert.equal(pageRes.status, 200);
    assert.match(await pageRes.text(), /https:\/\/www\.kidease\.ca\/daycare\//);
  }

  const skipped = await sitemapListingsMiddleware(
    { url: new URL("https://www.kidease.ca/sitemap.xml"), req: { method: "GET" } },
    () => "fell-through",
  );
  assert.equal(skipped, "fell-through");
});

test("security.txt is RFC 9116-ish and lives at /.well-known/security.txt", () => {
  assert.equal(existsSync(join(root, "public/.well-known/security.txt")), true);
  assert.match(security, /^Contact: mailto:support@kidease\.ca$/m);
  assert.match(security, /^Preferred-Languages: en, fr$/m);
  assert.match(security, /^Canonical: https:\/\/www\.kidease\.ca\/\.well-known\/security\.txt$/m);
  assert.match(security, /^Expires: 2027-09-05T00:00:00\.000Z$/m);
});
