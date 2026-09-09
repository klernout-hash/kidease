import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  compactExploreSearch,
  formatExploreDateRange,
  guestHeroSearch,
  isIsoDate,
  matchesDaycareName,
  parseExploreSearchFields,
} from "../src/lib/explore-search.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("explore search helpers parse dates, names, and compact query params", () => {
  assert.equal(isIsoDate("2026-09-15"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("soon"), false);

  const parsed = parseExploreSearchFields({
    q: " Winnipeg, MB ",
    name: " Bright ",
    from: "2026-10-01",
    to: "2026-09-15",
  });
  assert.equal(parsed.q, "Winnipeg, MB");
  assert.equal(parsed.name, "Bright");
  assert.equal(parsed.from, "2026-09-15");
  assert.equal(parsed.to, "2026-10-01");

  assert.equal(
    matchesDaycareName({ name: "Bright Beginnings", nameFr: "Débuts brillants" }, "bright"),
    true,
  );
  assert.equal(matchesDaycareName({ name: "Bright Beginnings", nameFr: "" }, "débuts"), false);
  assert.equal(matchesDaycareName({ name: "Acorn", nameFr: "Débuts brillants" }, "débuts"), true);
  assert.equal(matchesDaycareName({ name: "Acorn", nameFr: null }, "  "), true);

  const compact = compactExploreSearch({ q: " Toronto ", name: "", from: "2026-09-08", to: "" });
  assert.deepEqual(compact, { q: "Toronto", from: "2026-09-08" });
  assert.equal(formatExploreDateRange("2026-09-15", "2026-10-01", "en").includes("15"), true);
});

test("Explore search bar is an Airbnb-style pill wired to /search params", () => {
  const bar = src("src/components/explore-search-bar.tsx");
  const search = src("src/routes/search.tsx");
  const home = src("src/routes/index.tsx");
  const copy = src("src/lib/copy.ts");

  assert.match(bar, /searchWhere/);
  assert.match(bar, /searchWhen/);
  assert.match(bar, /searchDaycare/);
  assert.match(bar, /rounded-full bg-primary/);
  assert.match(bar, /SEARCH_STARTS/);
  assert.match(bar, /searchWhenHint/);
  assert.match(bar, /lg:flex-row/);

  assert.match(search, /ExploreSearchBar/);
  assert.match(search, /parseExploreSearchFields/);
  assert.match(search, /matchesDaycareName/);
  assert.match(search, /name: fields.name/);
  assert.match(search, /from: fields.from/);
  assert.match(search, /setView\("map"\)/);
  assert.match(search, /setView\("list"\)/);
  assert.match(search, /setFilters/);

  assert.match(home, /ExploreSearchBar/);
  assert.match(copy, /searchWhereHint: "City Province"/);
  assert.match(copy, /searchWhenHint: "Add dates"/);
  assert.match(copy, /searchDaycareHint: "Search by name"/);
});

test("guest hero treats unresolved text as a daycare name search", () => {
  assert.deepEqual(guestHeroSearch("  Winnipeg, MB  ", { label: "Winnipeg, MB" }), {
    q: "Winnipeg, MB",
  });
  assert.deepEqual(guestHeroSearch("Anne Ross Day Nursery", null), {
    name: "Anne Ross Day Nursery",
  });
  assert.deepEqual(guestHeroSearch("   ", null), {});

  const home = src("src/routes/index.tsx");
  const copy = src("src/lib/copy.ts");
  assert.match(home, /guestHeroSearch/);
  assert.match(home, /name: fields\.name/);
  assert.match(copy, /locationPh: "Address, city, postal code, or daycare"/);
  assert.match(copy, /locationPh: "Adresse, ville, code postal ou garderie"/);
});
