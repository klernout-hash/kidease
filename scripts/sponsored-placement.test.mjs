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
  assert.match(home, /t\("featuredBody"\)/);
  assert.match(src("src/lib/server/daycares.ts"), /stampPaidPlacement/);
  assert.match(src("src/lib/legal-copy.ts"), /marked Sponsored/);
  assert.match(src("src/lib/legal-copy.ts"), /mention Commandité/);
  assert.doesNotMatch(src("src/components/sponsored-mark.tsx"), /featuredCity \?\? true/);
});
