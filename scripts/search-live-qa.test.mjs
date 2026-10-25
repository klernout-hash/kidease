import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FAR_NAME_KM,
  licensedSearchCountLine,
  liveSearchParam,
  orderNameMatches,
  readLiveSearchFlag,
  splitLiveBrowseHint,
} from "../src/lib/explore-search.ts";
import { rankPlaceSuggestions, suggestLocalPlaces } from "../src/lib/place-suggest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("exact and prefix cities rank ahead of a nearer city that only contains the letters", () => {
  const biased = [
    { label: "Fort McMurray, AB", secondary: "Alberta" },
    { label: "Prince Albert, SK", secondary: "Saskatchewan" },
    { label: "Saskatoon, SK", secondary: "Saskatchewan" },
    { label: "Thompson, MB", secondary: "Manitoba" },
    { label: "Moose Jaw, SK", secondary: "Saskatchewan" },
    { label: "Edmonton, AB", secondary: "Alberta" },
  ];
  const ranked = rankPlaceSuggestions("Edmonton", biased);
  assert.equal(ranked[0]?.label, "Edmonton, AB");
  assert.equal(suggestLocalPlaces("Edmonton")[0]?.label, "Edmonton, AB");
  const prefix = rankPlaceSuggestions("Edm", [
    { label: "Red Deer, AB", secondary: "Alberta" },
    { label: "Edmonton, AB", secondary: "Alberta" },
  ]);
  assert.equal(prefix[0]?.label, "Edmonton, AB");
});

test("search header keeps the licensed count when a city also has live centres", () => {
  assert.equal(
    licensedSearchCountLine({
      nameSearch: false,
      liveCount: 1,
      licensed: "781 licensed centres",
      liveHint: "1 live · browse directory",
    }),
    "781 licensed centres · 1 live · browse directory",
  );
  assert.equal(
    licensedSearchCountLine({
      nameSearch: true,
      liveCount: 1,
      licensed: "4 licensed centres",
      liveHint: "1 live · browse directory",
    }),
    "4 licensed centres",
  );
  assert.match(src("src/routes/search.tsx"), /t\("exploreBrowseHint"\)/);
  assert.match(src("src/routes/search.tsx"), /licensedSearchCountLine/);
});

test("Live on KidEase is a shareable claim-verified filter", () => {
  const search = src("src/routes/search.tsx");
  assert.equal(readLiveSearchFlag(1), true);
  assert.equal(readLiveSearchFlag(true), true);
  assert.equal(readLiveSearchFlag("1"), true);
  assert.equal(readLiveSearchFlag('"1"'), true);
  assert.equal(readLiveSearchFlag("true"), false);
  assert.equal(liveSearchParam(true), 1);
  assert.equal(liveSearchParam(false), undefined);
  assert.match(search, /readLiveSearchFlag\(s\.live\)/);
  assert.match(search, /out\.live = 1/);
  assert.match(src("src/routes/index.tsx"), /live \? \{ live: 1 as const \}/);
  assert.match(search, /isClaimVerified/);
  assert.match(search, /writeLiveClaimed/);
  assert.match(search, /liveSearchParam\(liveOn\)/);
  assert.doesNotMatch(search, /live: liveOn \? "1"/);
  assert.match(search, /data-ke="browse-directory"/);
  assert.equal(splitLiveBrowseHint("1 live · browse directory").browse, "browse directory");
  assert.equal(splitLiveBrowseHint("1 live · browse directory").count, "1 live");
  assert.match(src("src/components/explore-filter-bar.tsx"), /data-ke="live-on-kidease"/);
  assert.match(src("src/components/shell.tsx"), /data-ke="live-on-kidease-tab"/);
  assert.match(src("src/routes/index.tsx"), /data-ke="home-live-on-kidease"/);
  assert.match(src("src/lib/copy.ts"), /liveOnKidEase: "Live on KidEase"/);
  assert.match(src("src/lib/copy.ts"), /liveOnKidEase: "En ligne sur KidEase"/);
  for (const pack of ["ar", "de", "es", "it", "pa", "tl", "yue", "zh"]) {
    const json = JSON.parse(src(`src/lib/i18n/${pack}.json`));
    assert.equal(typeof json.liveOnKidEase, "string");
    assert.ok(json.liveOnKidEase.length > 0);
  }
});

test("a Where box that is not a place becomes a name search, and name matches stay nearest first", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /name: label/);
  assert.match(src("src/routes/index.tsx"), /name: homeName\.trim\(\) \|\| typed/);
  assert.match(src("src/components/place-search.tsx"), /centre:/);
  const ordered = orderNameMatches([
    { name: "Little Fox Vancouver", distanceKm: 1869 },
    { name: "Little Fox Winnipeg", distanceKm: 4 },
    { name: "Little Fox Brandon", distanceKm: 200 },
  ]);
  assert.deepEqual(
    ordered.map((row) => row.name),
    ["Little Fox Winnipeg", "Little Fox Brandon", "Little Fox Vancouver"],
  );
  assert.equal(FAR_NAME_KM, 80);
  assert.match(search, /labelFar=\{nameSearch\}/);
  assert.match(src("src/components/daycare-card.tsx"), /farAway \? item\.province/);
});

test("large city searches overlay the nearest cards first", () => {
  const server = src("src/lib/server/daycares.ts");
  assert.match(server, /overlayCap = 192/);
  assert.match(server, /full && full\.length > 0 \? 80 : 400/);
  assert.match(src("src/routes/search.tsx"), /cached \? 160 : 0/);
});

test("parent Upgrade opens the plan view and daycare viewers do not see Request info on tours", () => {
  const route = src("src/routes/parent.tsx");
  const desk = src("src/components/parent-desk.tsx");
  assert.match(route, /subscriptionsEnabled !== true/);
  assert.match(route, /Navigate to="\/parent" search=\{\{ tab: "explore" \}\}/);
  assert.match(desk, /data-ke="parent-plan-view"/);
  assert.match(desk, /alwaysOffer/);
  assert.match(desk, /chrome\.paid \? "navMyPlan" : "navUpgrade"/);
  assert.match(src("src/components/parent-plus.tsx"), /alwaysOffer/);
  assert.match(src("src/components/parent-plus.tsx"), /plan-checkout/);
  const tours = src("src/components/listing-tour-times.tsx");
  assert.match(tours, /canBook/);
  assert.match(tours, /tourTimesEmpty/);
  assert.match(tours, /!canBook|canBook\s*\?/);
});
