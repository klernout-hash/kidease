import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { geocode } from "../src/lib/geo.ts";
import {
  directoryCountsFromRows,
  hubForDirectoryQuery,
  listingBelongsToHub,
  resolveSearchDirectory,
} from "../src/lib/city-directory.ts";
import { cityHubDefBySlug } from "../src/lib/city-hubs.ts";
import { cityParamFromUnknown, searchQueryFromUnknown } from "../src/lib/search-query.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function row(city, province, slug, name = "Centre") {
  return { slug, name, city, province };
}

test("city search param is read and does not replace q", () => {
  assert.equal(cityParamFromUnknown({ city: "Toronto" }), "Toronto");
  assert.equal(cityParamFromUnknown("?city=Winnipeg"), "Winnipeg");
  assert.equal(cityParamFromUnknown({ q: "Edmonton" }), "");
  assert.equal(searchQueryFromUnknown({ city: "Toronto", q: "Edmonton" }), "Edmonton");
  assert.equal(searchQueryFromUnknown("?city=Toronto"), "");
});

test("Toronto, Winnipeg, Vancouver, and Halifax stay in that city", () => {
  const cases = [
    ["Toronto", "toronto", "ON", "Toronto"],
    ["Winnipeg", "winnipeg", "MB", "Winnipeg"],
    ["Vancouver", "vancouver", "BC", "Vancouver"],
    ["Halifax", "halifax", "NS", "Halifax"],
  ];
  for (const [query, slug, province, city] of cases) {
    const decision = resolveSearchDirectory({ city: query });
    assert.deepEqual(decision, { kind: "hub", slug }, query);
    assert.equal(resolveSearchDirectory({ q: `${city}, ${province}` }).slug, slug);
    const def = cityHubDefBySlug(slug);
    assert.ok(def);
    assert.equal(listingBelongsToHub(row(city, province, `${slug}-centre`), def), true);
    assert.equal(listingBelongsToHub(row("Winnipeg", "MB", "other-centre"), def), slug === "winnipeg");
    assert.ok(geocode(query), query);
  }
  assert.equal(listingBelongsToHub(row("Toronto", "ON", "null"), cityHubDefBySlug("toronto")), false);
});

test("an unknown city is not the home city", () => {
  assert.deepEqual(resolveSearchDirectory({ city: "NotARealCityZZZ" }), { kind: "unknown" });
  assert.equal(geocode("NotARealCityZZZ"), null);
  assert.equal(hubForDirectoryQuery("NotARealCityZZZ"), null);
  assert.equal(resolveSearchDirectory({ q: "NotARealCityZZZ" }).kind, "nearby");
  assert.equal(resolveSearchDirectory({ city: "Brandon" }).kind, "nearby");
});

test("directory counts use the same city membership as search", () => {
  const counts = directoryCountsFromRows([
    row("Winnipeg", "MB", "wpg-1"),
    row("Winnipeg", "MB", "wpg-1"),
    row("Toronto", "ON", "tor-1"),
    row("Toronto", "ON", ""),
    row("Halifax", "NS", "hfx-1"),
    { slug: "hidden", name: "Ghost", city: "Winnipeg", province: "MB", visibility: "admin_only" },
    { slug: "no-name", name: "  ", city: "Vancouver", province: "BC" },
  ]);
  assert.equal(counts.hubs.winnipeg, 1);
  assert.equal(counts.hubs.toronto, 1);
  assert.equal(counts.hubs.halifax, 1);
  assert.equal(counts.hubs.vancouver, 0);
  assert.equal(counts.provinces.MB, 1);
  assert.equal(counts.provinces.ON, 1);
  assert.equal(counts.provinces.NS, 1);
});

test("search route honours city and refuses an unknown city fallback", () => {
  const search = readFileSync(join(root, "src/routes/search.tsx"), "utf8");
  const server = readFileSync(join(root, "src/lib/server/daycares.ts"), "utf8");
  assert.match(search, /cityParamFromUnknown\(location\.search\)/);
  assert.match(readFileSync(join(root, "src/routes/fr.search.tsx"), "utf8"), /searchLoader/);
  assert.match(readFileSync(join(root, "src/routes/search.tsx"), "utf8"), /searchQueryFromUnknown/);
  assert.match(server, /catalogNamedCityFromJson/);
  assert.match(search, /searchQueryFromUnknown\(location\.search\)/);
  assert.match(search, /unknownCity/);
  assert.match(search, /if \(city\) out\.city = city/);
  assert.match(search, /originsMatchSearchQuery\(boot\.origin, incoming\.q\)/);
  assert.match(server, /resolveSearchDirectory/);
  assert.match(server, /if \(decision\.kind === "unknown"\) return \[\]/);
  assert.match(server, /listingsForCityHub/);
  assert.match(server, /directorySlug: undefined/);
});
