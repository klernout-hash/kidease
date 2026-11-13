import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(join(root, "src/routes/daycare.$slug.tsx"), "utf8");
const gallery = readFileSync(join(root, "src/components/listing-hero-gallery.tsx"), "utf8");
const seo = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");

test("listing first paint includes overview text and one ChildCare JSON-LD", () => {
  assert.match(route, /id="listing-overview"/);
  assert.match(route, /t\("about"\)/);
  assert.match(route, /earlyAddress/);
  assert.doesNotMatch(route, /PageSkeleton/);
  assert.doesNotMatch(route, /photoPending/);
  assert.doesNotMatch(gallery, /photoPending/);
  assert.match(gallery, /ListingPhotoFallback/);
  assert.doesNotMatch(route, /dangerouslySetInnerHTML/);
  const jsonLdScripts = route.match(/application\/ld\+json/g) || [];
  assert.equal(jsonLdScripts.length, 2);
  assert.match(seo, /description: (found|sealed)\.description/);
  assert.match(seo, /hours: (found|sealed)\.hours/);
});

test("first paint keeps known hours and labels unconfirmed facts before hydration", () => {
  const firstPaint = route.slice(route.indexOf("    const earlyPhoto"), route.indexOf("  const d = data.daycare;", route.indexOf("    const earlyPhoto")));
  assert.match(firstPaint, /<dl[^>]+data-ke="listing-first-paint-facts"/);
  assert.match(firstPaint, /earlyHours \? \(/);
  assert.match(firstPaint, /<dd[^>]+>\{earlyHours\}<\/dd>/);
  assert.match(firstPaint, /Not confirmed/);
  assert.match(firstPaint, /Fees not confirmed\. A daily cap is not a monthly bill\./);
  assert.match(firstPaint, /\{earlyAddress\}/);
  assert.match(firstPaint, /\{earlyDesc\}/);
  assert.doesNotMatch(firstPaint, /ListingHeaderPills/);
});
