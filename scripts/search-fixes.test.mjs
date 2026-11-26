import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { test } from "node:test";
import { UNMEASURED_DISTANCE_KM, shownCardKm } from "../src/lib/card-distance.ts";
import { parentDistanceLabel } from "../src/lib/distance-label.ts";
import { plausibleListingKm } from "../src/lib/plausible-distance.ts";
import { WINNIPEG } from "../src/lib/geo.ts";
import { displayDistanceFor } from "../src/lib/units.ts";

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);
const { smartMatchScore } = await import("../src/lib/ranking/score.ts");

test("the 1,000,000 km sort sentinel is never shown", () => {
  assert.equal(shownCardKm(UNMEASURED_DISTANCE_KM), null);
  assert.equal(shownCardKm(0), null);
  assert.equal(shownCardKm(Number.NaN), null);
  assert.equal(shownCardKm(2.4), 2.4);
  assert.equal(
    parentDistanceLabel({ km: UNMEASURED_DISTANCE_KM, away: "km away", show: true }),
    "",
  );
  assert.equal(plausibleListingKm(UNMEASURED_DISTANCE_KM, "Winnipeg", "R3C 0A1"), false);
});

test("a city-centre stand-in pin never earns Close to home", () => {
  const home = { lat: 49.9, lng: -97.14 };
  const base = { id: "a", ageMinMonths: 0, ageMaxMonths: 60, agesKnown: true };
  const stand = smartMatchScore(
    { ...base, lat: WINNIPEG.lat, lng: WINNIPEG.lng },
    { home, radiusKm: 10 },
  );
  assert.equal(
    stand.why.some((w) => w.code === "close_home"),
    false,
  );
  const door = smartMatchScore({ ...base, lat: 49.905, lng: -97.14 }, { home, radiusKm: 10 });
  assert.equal(
    door.why.some((w) => w.code === "close_home"),
    true,
  );
});

test("French distances use a decimal comma and an FR template", () => {
  assert.equal(displayDistanceFor(0.5, "km", "fr"), "0,5");
  assert.equal(displayDistanceFor(0.5, "km", "en"), "0.5");
  assert.equal(
    parentDistanceLabel({ km: 0.5, away: "à {n} km", show: true, locale: "fr" }),
    "à 0,5 km",
  );
  assert.equal(
    parentDistanceLabel({ km: 0.5, away: "km away", show: true, locale: "en" }),
    "0.5 km away",
  );
});

test("guests get no default commute from an old stored work place", async () => {
  const mem = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      m,
    };
  };
  const local = mem();
  const session = mem();
  globalThis.window = { localStorage: local, sessionStorage: session };
  const { readDualAnchorPrefs, writeDualAnchorPrefs, DUAL_ANCHOR_STORAGE_KEY } =
    await import("../src/lib/dual-anchor.ts");
  local.setItem(
    DUAL_ANCHOR_STORAGE_KEY,
    JSON.stringify({
      work: { lat: 50.57, lng: -96.2, label: "Powerview-Pine Falls, MB, Canada" },
      mode: "both",
    }),
  );
  assert.deepEqual(readDualAnchorPrefs(), { work: null, mode: "home" });
  assert.equal(local.getItem(DUAL_ANCHOR_STORAGE_KEY), null);
  writeDualAnchorPrefs({ work: { lat: 49.9, lng: -97.1, label: "Winnipeg, MB" }, mode: "both" });
  assert.equal(readDualAnchorPrefs().work?.label, "Winnipeg, MB");
  delete globalThis.window;
});

test("postal searches keep the postal code in the URL", async () => {
  const { postalSearchLabel } = await import("../src/lib/geo.ts");
  assert.equal(postalSearchLabel("r3c0a1"), "R3C 0A1");
  assert.equal(postalSearchLabel("R3C 0A1"), "R3C 0A1");
  assert.equal(postalSearchLabel("r3c"), "R3C");
  assert.equal(postalSearchLabel("Winnipeg, MB"), null);
  assert.equal(postalSearchLabel("Halifax"), null);
});

test("a tighter radius narrows a city hub search", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/lib/server/daycares.ts", import.meta.url), "utf8");
  assert.match(
    src,
    /else if \(data\.radiusKm < DEFAULT_SEARCH_RADIUS_KM\) \{\n\s+cards = cards\.filter\(\(card\) => includeCardInRadius\(card, origin, data\.radiusKm\)\);/,
  );
  const search = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  assert.match(search, /const postal = postalSearchLabel\(label\);/);
});

test("support filters accept both inclusive and special-needs tags", async () => {
  const { rowListsExtraSupport, rowHasCareDetail } =
    await import("../src/lib/inclusive-filters.ts");
  assert.equal(rowListsExtraSupport("meals,inclusive"), true);
  assert.equal(rowListsExtraSupport("special-needs"), true);
  assert.equal(rowListsExtraSupport("meals,halal"), false);
  assert.equal(rowHasCareDetail("inclusive", "special-needs"), true);
  assert.equal(rowHasCareDetail("halal,inclusive", "halal"), true);
});

test("one chip per active filter and the badge matches the chips", async () => {
  const { searchActiveFilters, searchSheetFilterCount } =
    await import("../src/lib/saved-search.ts");
  const input = {
    filters: { avail: "any", inclusive: true },
    pioneer: { inclusive: "1", spoken: "fr,pa" },
    careKeys: ["halal", "special-needs"],
    licence: "centre",
  };
  const chips = searchActiveFilters(input);
  assert.deepEqual(
    chips.map((c) => c.kind),
    ["support", "spoken", "spoken", "diet", "licence"],
  );
  assert.equal(searchSheetFilterCount(input), chips.length);
  assert.equal(searchSheetFilterCount({ filters: {}, careKeys: ["halal"] }), 1);
});

test("old /daycares/:city links go to the city page in EN and FR", async () => {
  const { legacyDaycaresCityTarget } = await import("../src/lib/daycares-legacy-path.ts");
  assert.deepEqual(legacyDaycaresCityTarget("winnipeg", "en"), {
    href: "/daycare/city/winnipeg",
    slug: "winnipeg",
    hub: true,
  });
  assert.deepEqual(legacyDaycaresCityTarget("Winnipeg", "fr"), {
    href: "/fr/daycare/city/winnipeg",
    slug: "winnipeg",
    hub: true,
  });
  assert.deepEqual(legacyDaycaresCityTarget("brandon", "en"), {
    href: "/search",
    q: "Brandon, MB",
    hub: false,
  });
  assert.deepEqual(legacyDaycaresCityTarget("brandon", "fr"), {
    href: "/fr/search",
    q: "Brandon, MB",
    hub: false,
  });
  const { readFileSync } = await import("node:fs");
  const tree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
  for (const id of [
    "/daycares_/$city",
    "/fr/daycares_/$city",
    "/daycares_/$city_/$age",
    "/fr/daycares_/$city_/$age",
  ]) {
    assert.ok(tree.includes(`'${id}'`), id);
  }
});

test("open spots: honest empty state, /open-spots redirect and footer link", async () => {
  const { readFileSync } = await import("node:fs");
  const search = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  assert.match(search, /No open spots reported here right now/);
  assert.match(search, /localePath\("\/vacancy-index", locale\)/);
  const { FOOTER_PARENTS } = await import("../src/lib/site-footer-nav.ts");
  assert.ok(FOOTER_PARENTS.some((link) => link.to === "/vacancy-index" && link.localePaired));
  const tree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
  assert.ok(tree.includes("'/open-spots'") && tree.includes("'/fr/open-spots'"));
});

test("map retries with backoff and keeps pins inside the radius", async () => {
  const { mapRetryDelay, pinsWithinRadius, MAP_RETRY_DELAYS_MS } =
    await import("../src/lib/search-map-state.ts");
  assert.equal(mapRetryDelay(0), MAP_RETRY_DELAYS_MS[0]);
  assert.ok(mapRetryDelay(1) > mapRetryDelay(0));
  assert.equal(mapRetryDelay(MAP_RETRY_DELAYS_MS.length), null);
  const wpg = { lat: 49.8951, lng: -97.1384 };
  const pins = [
    { id: "near", lat: 49.9, lng: -97.14 },
    { id: "brandon", lat: 49.848, lng: -99.95 },
  ];
  assert.deepEqual(
    pinsWithinRadius(pins, wpg, 25).map((p) => p.id),
    ["near"],
  );
  const { readFileSync } = await import("node:fs");
  const search = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(
    search,
    /searchPins=\{searchMapPins\.length > 0 \? searchMapPins : undefined\}/,
  );
  assert.match(search, /const delay = mapRetryDelay\(attempt\);/);
});

test("Iqaluit listings stored on a regional pin are found by an Iqaluit search", async () => {
  const { cityPinForStrayListing, includeCardInRadius } =
    await import("../src/lib/card-distance.ts");
  const iqaluit = { lat: 63.7467, lng: -68.517 };
  const row = { city: "Iqaluit", province: "NU", lat: 79.612, lng: -76.796 };
  const fixed = cityPinForStrayListing(row);
  assert.deepEqual(fixed, iqaluit);
  assert.equal(includeCardInRadius({ ...row, ...fixed }, iqaluit, 25), true);
  assert.equal(
    cityPinForStrayListing({ city: "Iqaluit", province: "NU", lat: 63.75, lng: -68.5 }),
    null,
  );
  assert.equal(
    cityPinForStrayListing({ city: "Igloolik", province: "NU", lat: 79.6, lng: -76.8 }),
    null,
  );
  assert.equal(
    cityPinForStrayListing({ city: "Winnipeg", province: "MB", lat: 49.9, lng: -97.1 }),
    null,
  );
});

test("Wpg is shown as Winnipeg", async () => {
  const { displayCityName } = await import("../src/lib/city-display.ts");
  assert.equal(displayCityName("Wpg"), "Winnipeg");
  assert.equal(displayCityName("WPG."), "Winnipeg");
  assert.equal(displayCityName(" Brandon "), "Brandon");
  assert.equal(displayCityName(null), "");
});

test("French distances use a decimal comma and read 'à … km'", async () => {
  const { parentDistanceLabel } = await import("../src/lib/distance-label.ts");
  const { fastDistanceLine } = await import("../src/lib/need-care-fast.ts");
  assert.equal(
    parentDistanceLabel({ km: 0.5, away: "à {n} km", show: true, locale: "fr" }),
    "à 0,5 km",
  );
  assert.equal(
    parentDistanceLabel({ km: 0.5, away: "km away", show: true, locale: "en" }),
    "0.5 km away",
  );
  assert.equal(fastDistanceLine("1.2 km", true, "de distance"), "à 1,2 km");
  assert.equal(fastDistanceLine("1.2 km", false, "away"), "1.2 km away");
  const fr = readFileSync(new URL("../src/lib/copy-fr.ts", import.meta.url), "utf8");
  assert.match(fr, /kmAway: "à \{n\} km"/);
  for (const file of [
    "src/components/daycare-card.tsx",
    "src/components/shortlist-compare.tsx",
    "src/routes/compare.tsx",
    "src/components/map-view.tsx",
  ]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(src, /parentDistanceLabel\(\{[\s\S]{0,120}locale/, file);
  }
});

test("listing licence card never prints the internal stored status", () => {
  const card = readFileSync(
    new URL("../src/components/inspection-trust-card.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(card, /Stored status|Statut enregistré|Stored expiry|data-licence-status/);
  assert.match(card, /Licence expiry on file/);
});

test("address search does not geocode the same place twice", () => {
  const client = readFileSync(
    new URL("../src/components/place-search.tsx", import.meta.url),
    "utf8",
  );
  assert.match(client, /REMOTE_PLACE_MEMO\.set\(placeMemoKey\(place\.label\), place\)/);
  assert.match(client, /REMOTE_PLACE_INFLIGHT\.get\(key\)/);
  assert.match(client, /const remote = await remotePlace\(q\)/);
  const server = readFileSync(
    new URL("../src/lib/server/google-places.ts", import.meta.url),
    "utf8",
  );
  assert.match(server, /storeGeo\(place\.label\.toLowerCase\(\), place\)/);
});
