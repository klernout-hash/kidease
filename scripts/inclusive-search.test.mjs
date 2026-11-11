import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { inclusiveFiltersEnabled } from "../src/lib/features.ts";
import {
  CARE_DECLARATION_NOTE,
  careChipsWhen,
  careKeysParam,
  matchesDeclaredCare,
  parseCareKeys,
} from "../src/lib/inclusive-search.ts";
import { sanitizeProductProperties } from "../src/lib/product-events.ts";

test("diet and extra-support chips stay hidden until the flag is on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_INCLUSIVE_FILTERS, false);
  assert.equal(inclusiveFiltersEnabled({}), false);
  assert.deepEqual(careChipsWhen(false), []);
  assert.equal(careChipsWhen(true).length, 5);
  assert.match(CARE_DECLARATION_NOTE.en, /has not checked/);
  assert.match(CARE_DECLARATION_NOTE.fr, /ne les a pas vérifiés/);
});

test("a care filter matches only an exact declared key", () => {
  assert.equal(matchesDeclaredCare("meals,halal", ["halal"]), true);
  assert.equal(matchesDeclaredCare("We serve halal meals in the description", ["halal"]), false);
  assert.equal(matchesDeclaredCare("kosher", ["halal"]), false);
  assert.equal(matchesDeclaredCare(null, ["nut-free"]), false);
  assert.equal(matchesDeclaredCare("vegetarian,special-needs", ["vegetarian", "special-needs"]), true);
  assert.equal(matchesDeclaredCare("halal", []), true);
  assert.deepEqual(parseCareKeys("halal,not-a-key,kosher"), ["halal", "kosher"]);
  assert.deepEqual(sanitizeProductProperties("inclusive_filter_applied", { key: "halal", email: "a@b.c" }), {
    key: "halal",
  });
});

test("diet keys survive as one URL value", () => {
  assert.equal(careKeysParam(["nut-free", "special-needs", "nope"]), "nut-free,special-needs");
  assert.equal(careKeysParam([]), undefined);
  assert.deepEqual(parseCareKeys("nut-free,special-needs"), ["nut-free", "special-needs"]);
});
