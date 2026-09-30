import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("explore and search share six daycare-type rows with in-row show more", () => {
  const rails = src("src/components/facility-type-rails.tsx");
  const home = src("src/routes/index.tsx");
  const search = src("src/routes/search.tsx");
  const rail = src("src/components/listing-rail.tsx");
  const copy = src("src/lib/copy.ts");
  const css = src("src/styles.css");
  const daycares = src("src/lib/server/daycares.ts");

  for (const type of [
    "child_care_centre",
    "family_home",
    "group_home",
    "nursery_preschool",
    "school_age",
    "before_after",
  ]) {
    assert.match(rails, new RegExp(type));
  }
  assert.match(rails, /data-ke="daycare-type-menu"/);
  assert.match(rails, /BROWSE_RAIL_PAGE = 12/);
  assert.match(rails, /expandable/);
  assert.match(rails, /pageSize=\{BROWSE_RAIL_PAGE\}/);
  assert.match(home, /FacilityTypeRails items=\{shown\} visual/);
  assert.match(search, /DaycareTypeRails/);
  assert.match(search, /data-ke="search-result-list"/);
  assert.match(search, /writeBrowseType/);
  assert.doesNotMatch(search, /FacilityTypeRails/);
  assert.match(rail, /showMoreListings/);
  assert.match(rail, /ke-rail-more/);
  assert.match(rail, /ke-rail-card--in/);
  assert.match(css, /ke-rail-card--in/);
  assert.match(css, /ke-rail-more-lift/);
  assert.match(copy, /showMoreListings: "Show more listings"/);
  assert.match(copy, /showMoreListings: "Voir plus de garderies"/);
  assert.match(daycares, /HOME_TYPE_POOL = 72/);
});
