import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { copy } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("paid Featured placements are marked Sponsored on home ranking and listing cards", () => {
  assert.equal(copy.en.sponsored, "Sponsored");
  assert.equal(copy.fr.sponsored, "Commandité");
  assert.match(copy.en.featuredBody, /marked Sponsored/);
  assert.match(copy.fr.featuredBody, /Commandité/);
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /SponsoredMark/);
  assert.match(card, /show=\{item\.featuredCity\}/);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /SponsoredMark show=\{d\.featuredCity\}/);
  const home = src("src/routes/index.tsx");
  assert.match(home, /"featuredBody"/);
  assert.match(src("src/lib/server/daycares.ts"), /stampPaidPlacement/);
  assert.match(src("src/lib/legal-copy.ts"), /marked Sponsored/);
  assert.match(src("src/lib/legal-copy.ts"), /mention Commandité/);
  assert.doesNotMatch(src("src/components/sponsored-mark.tsx"), /featuredCity \?\? true/);
});

test("FEATURE_SPONSORED_LISTINGS defaults off and gates every Sponsored label", async () => {
  const { sponsoredListingsEnabled } = await import("../src/lib/sponsored-flag.ts");
  assert.equal(sponsoredListingsEnabled(undefined), false);
  assert.equal(sponsoredListingsEnabled(""), false);
  assert.equal(sponsoredListingsEnabled("true"), true);
  assert.match(src("src/components/sponsored-mark.tsx"), /!FEATURE_SPONSORED_LISTINGS \|\| !show/);
  assert.match(src("src/components/map-view.tsx"), /FEATURE_SPONSORED_LISTINGS && item\.featuredCity/);
  assert.match(src("src/routes/index.tsx"), /FEATURE_SPONSORED_LISTINGS \? "featuredBody" : "featuredBodyPlain"/);
  assert.doesNotMatch(copy.en.featuredBodyPlain, /Sponsored/);
  assert.doesNotMatch(copy.fr.featuredBodyPlain, /Commandité/);
});
