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
  "/support",
  "/team",
  "/benefits",
  "/tour-checklist",
  "/get-app",
  "/claim",
  "/compare",
];

test("robots.txt keeps admin disallows and points Sitemap at the www URL", () => {
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.match(robots, /^Disallow: \/admin-contracts$/m);
  assert.match(robots, /^Disallow: \/admin-chat$/m);
  assert.match(robots, /^Disallow: \/daycare\/test-ghost-claim-lab$/m);
  assert.match(robots, /^Disallow: \/book\/test-ghost-claim-lab$/m);
  assert.match(robots, /^Sitemap: https:\/\/www\.kidease\.ca\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Sitemap: https:\/\/kidease\.ca\/sitemap\.xml/);
});

test("sitemap.xml lists canonical www public pages and omits admin paths", () => {
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  for (const path of PUBLIC_PATHS) {
    const loc = `https://www.kidease.ca${path === "/" ? "/" : path}`;
    assert.match(sitemap, new RegExp(`<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`));
  }
  assert.doesNotMatch(sitemap, /https:\/\/kidease\.ca\//);
  assert.doesNotMatch(sitemap, /\/admin/);
  assert.doesNotMatch(sitemap, /test-ghost-claim-lab/);
});

test("vercel CSP does not allowlist grok.com and still keeps product hosts", () => {
  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /maps\.googleapis\.com/);
  assert.match(vercel, /js\.stripe\.com/);
  assert.match(vercel, /challenges\.cloudflare\.com/);
  assert.match(vercel, /us\.i\.posthog\.com/);
  assert.match(vercel, /script-src 'self' 'unsafe-inline'/);
  assert.match(vercel, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(vercel, /grok\.com/);
  assert.match(vercel, /"source": "\/admin-chat"/);
  assert.match(vercel, /"source": "\/daycare\/test-ghost-claim-lab"/);
  assert.match(vercel, /"source": "\/book\/test-ghost-claim-lab"/);
});

test("security.txt is RFC 9116-ish and lives at /.well-known/security.txt", () => {
  assert.equal(existsSync(join(root, "public/.well-known/security.txt")), true);
  assert.match(security, /^Contact: mailto:kyle@kidease\.ca$/m);
  assert.match(security, /^Preferred-Languages: en, fr$/m);
  assert.match(security, /^Canonical: https:\/\/www\.kidease\.ca\/\.well-known\/security\.txt$/m);
  assert.match(security, /^Expires: 2027-09-05T00:00:00\.000Z$/m);
});
