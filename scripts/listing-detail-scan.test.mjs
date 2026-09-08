import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("listing detail drops FAQ blocks and keeps chips plus Support links", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.doesNotMatch(listing, /FacilityTypeBlurb/);
  assert.doesNotMatch(listing, /TrustExplainer/);
  assert.doesNotMatch(listing, /licensedCentreLine/);
  assert.doesNotMatch(listing, /facilityTypeLeadCentre/);
  assert.doesNotMatch(listing, /trustWhatMeans/);
  assert.match(listing, /ListingBadges/);
  assert.match(listing, /CompletenessBanner/);
  assert.match(listing, /t\("learnMore"\)/);
  assert.match(listing, /t\("unclaimedWhatMeans"\)/);
  assert.match(listing, /to="\/verify"/);
  assert.match(listing, /hash="unclaimed"/);
  assert.match(src("src/components/listing-badges.tsx"), /data-facility-type/);
});

test("mobile listing CTAs use short labels that stay inside pills", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /searchNearbyShort/);
  assert.match(listing, /claimCtaShort/);
  assert.match(listing, /overflow-x-auto/);
  assert.match(listing, /whitespace-nowrap/);
  assert.match(listing, /h-11 shrink-0 px-3.5 text-\[13px\]/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /searchNearbyShort: "Search nearby"/);
  assert.match(copy, /claimCtaShort: "Claim daycare"/);
  assert.match(copy, /searchNearbyShort: "Chercher près d’ici"/);
  assert.match(copy, /claimCtaShort: "Réclamer"/);
});

test("Support verify page holds listing explanations", () => {
  const verify = src("src/routes/verify.tsx");
  assert.match(verify, /listingsVerify/);
  assert.match(verify, /licensedCentreLine/);
  assert.match(verify, /TrustExplainer/);
  assert.match(verify, /facilityTypeLeadCentre/);
  assert.match(verify, /id="unclaimed"/);
  assert.match(verify, /verifyUnclaimedBody/);
  const footer = src("src/components/site-footer.tsx");
  const support = footer.slice(footer.indexOf('t("support")'), footer.indexOf("ke-footer-legal"));
  assert.match(support, /to="\/verify"/);
  assert.match(src("src/routes/menu.tsx"), /to="\/verify"/);
});
