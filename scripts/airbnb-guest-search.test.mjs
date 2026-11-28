import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOntarioCapMonthly, publicMonthlyFee } from "../src/lib/listing-fee.ts";

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("search map stays a short pane and the listing bar has two actions", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /h-\[min\(40dvh,28rem\)\]/);
  assert.doesNotMatch(search, /72dvh|62vh/);
  const listing = src("src/routes/daycare.$slug.tsx");
  const bar = listing.slice(listing.indexOf('data-ke="listing-sticky-bar"'));
  assert.match(bar, /data-ke="listing-sticky-cta"/);
  assert.match(bar, /data-ke="listing-sticky-tour"/);
  assert.match(bar, /flex-1/);
  assert.equal(isOntarioCapMonthly(477), true);
  assert.equal(publicMonthlyFee(477, { province: "ON" }), null);
  assert.equal(publicMonthlyFee(477, { province: "ON", feeConfidence: "centre" }), 477);
  assert.match(src("src/components/save-listing-button.tsx"), /save-signin-sheet/);
  assert.match(src("src/routes/index.tsx"), /<MobileSearchHome/);
});
