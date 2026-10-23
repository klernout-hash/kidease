import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isWebsiteChange, shouldIgnoreVercelBuild } from "./vercel-ignore.mjs";

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("list queries skip the long catalogue copy columns", () => {
  const neon = src("src/lib/server/catalog-neon.ts");
  const list = neon.slice(neon.indexOf("export const CATALOG_LIST_SELECT"), neon.indexOf("export const PUBLIC_CATALOG_COUNT_SQL"));
  assert.match(list, /id, slug, name/);
  assert.match(list, /photos/);
  assert.match(list, /hours/);
  assert.doesNotMatch(list, /description/);
  assert.doesNotMatch(list, /tagline/);
  assert.doesNotMatch(list, /hours_fr/);
  assert.doesNotMatch(list, /contact_email/);
  const near = neon.slice(neon.indexOf("export const NEON_NEAR_SQL"), neon.indexOf("export function neonNearSql"));
  assert.match(near, /CATALOG_LIST_SELECT/);
  assert.doesNotMatch(near, /CATALOG_SELECT/);
  const detail = neon.slice(neon.indexOf("export const CATALOG_SELECT"), neon.indexOf("export const CATALOG_LIST_SELECT"));
  assert.match(detail, /description/);
});

test("a listing view does not write the catalogue row back or score the metro twice up front", () => {
  const daycares = src("src/lib/server/daycares.ts");
  const listing = daycares.slice(daycares.indexOf("export const getDaycare"), daycares.indexOf("export const getHiddenReviewRedirect"));
  assert.doesNotMatch(listing, /upsertDaycare/);
  assert.doesNotMatch(listing, /catalogNear\(origin, 15\)/);
  assert.match(listing, /catalogNear\(origin, 40\)/);
  assert.match(listing, /distanceKm <= 15/);
  const beforeTry = listing.slice(0, listing.indexOf("try {"));
  assert.doesNotMatch(beforeTry, /overlayQuality/);
});

test("name search uses the narrow name index", () => {
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /queryNeonPublicNameIndex/);
  assert.match(daycares, /queryNeonListingsByIds/);
});

test("unchanged quality scores are not rewritten", () => {
  const quality = src("src/lib/server/quality.ts");
  assert.match(quality, /quality_score is distinct from/);
});

test("docs and native-only diffs skip the Vercel build", () => {
  assert.equal(isWebsiteChange("docs/neon.md"), false);
  assert.equal(isWebsiteChange("README.md"), false);
  assert.equal(isWebsiteChange("android/app/build.gradle"), false);
  assert.equal(isWebsiteChange("src/routes/search.tsx"), true);
  assert.equal(shouldIgnoreVercelBuild("main", { changedFiles: ["docs/neon.md"] }), true);
  assert.equal(shouldIgnoreVercelBuild("main", { changedFiles: [] }), false);
});
