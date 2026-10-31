import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { inclusiveFiltersEnabled } from "../src/lib/features.ts";
import { careDetailLabel, languageChipMatches, rowHasCareDetail } from "../src/lib/inclusive-filters.ts";
import { rowMatchesPioneer } from "../src/lib/pioneer-filters.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("inclusive care details default off and match search in English and French", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_INCLUSIVE_FILTERS, false);
  assert.equal(inclusiveFiltersEnabled({}), false);
  assert.equal(inclusiveFiltersEnabled({ FEATURE_INCLUSIVE_FILTERS: "1" }), true);
  assert.equal(careDetailLabel("halal", "en"), "Halal meals");
  assert.equal(careDetailLabel("nut-free", "fr"), "Sans noix");
  assert.equal(careDetailLabel("special-needs", "fr"), "Soutien supplémentaire");
  assert.equal(rowHasCareDetail("meals,halal", "halal"), true);
  assert.equal(languageChipMatches("staff speak French", "fr"), true);
  assert.equal(
    rowMatchesPioneer({ amenities: "special-needs" }, {
      cwelcc: false,
      openings: false,
      inclusive: true,
      meals: false,
      subsidy: false,
      langs: [],
    }),
    true,
  );
  assert.equal(
    rowMatchesPioneer({ amenities: "halal", languages: "French" }, {
      cwelcc: false,
      openings: false,
      inclusive: false,
      meals: true,
      subsidy: false,
      langs: ["fr"],
    }),
    true,
  );
  assert.match(read("src/components/provider-parent-fields.tsx"), /data-ke="care-details"/);
  assert.match(read("src/components/provider-parent-fields.tsx"), /localePath\("\/help"/);
  assert.match(read("src/lib/parent-listing.ts"), /CARE_DETAIL_KEYS/);
  assert.match(read(".env.example"), /^FEATURE_INCLUSIVE_FILTERS=0$/m);
  assert.doesNotMatch(read("src/lib/inclusive-filters.ts"), /google/i);
});
