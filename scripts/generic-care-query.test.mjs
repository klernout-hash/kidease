import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  foldCareQuery,
  isGenericCareQuery,
  isTaintedCareOriginLabel,
} from "../src/lib/generic-care-query.ts";
import { trustedSavedOrigin } from "../src/lib/default-origin.ts";
import { rememberSearch } from "../src/lib/recent-searches.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("generic care words fold and match EN + FR", () => {
  assert.equal(foldCareQuery("  Day-Care  "), "day care");
  for (const q of [
    "daycare",
    "Day Care",
    "child care",
    "childcare",
    "garderie",
    "CPE",
    "preschool",
    "nursery",
    "centre",
    "home daycare",
    "family child care",
    "centre de la petite enfance",
    "milieu familial",
    "halte-garderie",
    "licensed daycare",
  ]) {
    assert.equal(isGenericCareQuery(q), true, q);
  }
  for (const q of ["Winnipeg", "Edmonton, AB", "R3T 2N2", "123 Daycare Lane", "Winnipeg daycare", ""]) {
    assert.equal(isGenericCareQuery(q), false, q);
  }
});

test("tainted Lower South River origin is rejected", () => {
  assert.equal(isTaintedCareOriginLabel("Lower South River, NS"), true);
  assert.equal(isTaintedCareOriginLabel("Winnipeg, MB"), false);
  const bad = trustedSavedOrigin({
    lat: 45.6,
    lng: -61.9,
    label: "Lower South River, Antigonish, NS, Canada",
    explicit: true,
  });
  assert.equal(bad, null);
  const good = trustedSavedOrigin({
    lat: 49.8951,
    lng: -97.1384,
    label: "Winnipeg, MB",
    explicit: true,
  });
  assert.ok(good);
  assert.match(good.label, /Winnipeg/);
  assert.deepEqual(
    rememberSearch([], "Lower South River, NS").map((r) => r.label),
    [],
  );
});

test("resolveLocationQuery and geocodePlace skip Photon for care words", () => {
  const place = src("src/components/place-search.tsx");
  assert.match(place, /isGenericCareQuery/);
  assert.match(place, /if \(isGenericCareQuery\(q\)\) return null;/);
  const geo = src("src/lib/server/google-places.ts");
  assert.match(geo, /isGenericCareQuery\(data\)/);
  assert.match(geo, /isGenericCareQuery\(data\.q\)/);
  const boot = src("src/lib/search-origin.ts");
  assert.match(boot, /!isGenericCareQuery\(incomingQ\)/);
  const search = src("src/routes/search.tsx");
  assert.match(search, /genericCare \? "" : rawQ/);
  assert.match(search, /isGenericCareQuery\(place\)/);
});

test("phone home keeps one Airbnb care row when the flag is on", () => {
  const css = src("src/styles.css");
  const shell = src("src/components/shell.tsx");
  assert.match(shell, /data-ke="phone-care-tabs"/);
  assert.match(css, /\.ke-home \[data-ke="msv2-categories"\]/);
  assert.match(css, /:has\(\.ke-home\) \[data-ke="phone-care-tabs"\]/);
  assert.match(src("src/routes/index.tsx"), /<AirbnbCareCategories/);
});
