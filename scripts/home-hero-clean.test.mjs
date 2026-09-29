import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { citiesIndexGroups } from "../src/lib/cities-index.ts";
import { CITY_HUB_DEFS } from "../src/lib/city-hubs.ts";
import { nearbyHomeCities } from "../src/lib/home-popular-cities.ts";
import { PROVINCES } from "../src/lib/geo.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("home hero has no city pills and one Browse by city link", () => {
  const home = src("src/routes/index.tsx");
  const hero = home.slice(home.indexOf("from-soft"), home.indexOf('id="how"'));
  assert.doesNotMatch(hero, /HomePopularCities/);
  assert.doesNotMatch(hero, /<CityHubLinks/);
  assert.doesNotMatch(hero, /CITY_CHIPS/);
  assert.doesNotMatch(hero, /heroPopular/);
  assert.match(hero, /\{heroCityBrowse\}/);
  assert.equal((home.match(/data-ke="browse-cities"/g) ?? []).length, 1);
  assert.match(home, /to="\/cities"/);
  assert.doesNotMatch(home, /<CityHubLinks/);
  assert.doesNotMatch(src("src/routes/fr.index.tsx"), /<CityHubLinks/);
  assert.match(src("src/routes/fr.index.tsx"), /to="\/cities"/);
});

test("live toggle stays off the home hero when the live count is 0", () => {
  const home = src("src/routes/index.tsx");
  assert.match(home, /featuredReady && strip\.liveCount > 0/);
  assert.doesNotMatch(home, /data-ke="home-zero-live"/);
  assert.doesNotMatch(home, /exploreBrowseHint/);
});

test("home keeps a single trust disclaimer and the police-check wording", () => {
  const home = src("src/routes/index.tsx");
  const copy = src("src/lib/copy.ts");
  assert.doesNotMatch(home, /t\("heroTrust"\)/);
  assert.doesNotMatch(src("src/routes/fr.index.tsx"), /t\("heroTrust"\)/);
  assert.match(home, /<TrustBar/);
  const web = home.slice(home.indexOf("ke-web-only"), home.indexOf("ke-app-only"));
  assert.equal((web.match(/<TrustBar/g) ?? []).length, 1);
  assert.doesNotMatch(home.slice(home.indexOf("ke-app-only")), /<TrustBar/);
  assert.match(copy, /trustBarLead: "KidEase verifies licences and listing ownership\. Screening on file means required documents were reviewed\. KidEase does not run police checks\."/);
  assert.match(copy, /trustBarLead: "KidEase vérifie les permis et qui possède une fiche\. Dossier de filtrage signifie que les documents requis ont été examinés\. KidEase ne fait pas de contrôle policier\."/);
  assert.doesNotMatch(home, /OptionalUpgrades/);
  assert.doesNotMatch(home, /showPayCtas/);
});

test("search control has a Search button, radius, and no Care schedule subtitle", () => {
  const bar = src("src/components/explore-search-bar.tsx");
  const home = src("src/routes/index.tsx");
  assert.match(bar, /data-ke="search-submit"/);
  assert.match(bar, /t\("searchSubmit"\)/);
  assert.match(bar, /data-ke="search-radius"/);
  assert.match(bar, /data-ke="where-field"/);
  assert.match(bar, /data-ke="where-controls"/);
  assert.doesNotMatch(bar, /whenFilled \? whenLabel : t\("searchWhen"\)/);
  assert.match(home, /onRadiusChange=\{setRadiusKm\}/);
  assert.doesNotMatch(home, /displayDistance\(radiusKm/);
  assert.match(src("src/lib/copy.ts"), /searchSubmit: "Search"/);
  assert.match(src("src/lib/copy.ts"), /searchSubmit: "Rechercher"/);
});

test("cities index lists every province and only real city hubs", () => {
  const groups = citiesIndexGroups("en");
  assert.deepEqual(
    groups.map((group) => group.code),
    PROVINCES.map((province) => province.code),
  );
  assert.equal(groups.length, 13);
  const linked = groups.flatMap((group) => group.cities.map((city) => city.slug));
  assert.deepEqual(linked.slice().sort(), CITY_HUB_DEFS.map((hub) => hub.slug).slice().sort());
  assert.deepEqual(
    groups.find((group) => group.code === "ON")?.cities.map((city) => city.slug),
    ["toronto", "ottawa", "hamilton"],
  );
  assert.equal(groups.find((group) => group.code === "SK")?.cities.length, 0);
  assert.equal(groups.find((group) => group.code === "ON")?.name, "Ontario");
  assert.equal(citiesIndexGroups("fr").find((group) => group.code === "QC")?.name, "Québec");
  const page = src("src/routes/cities.tsx");
  assert.match(page, /createFileRoute\("\/cities"\)/);
  assert.match(page, /\/daycare\/city\/\$city/);
  assert.doesNotMatch(page, /\bstate\b/i);
  assert.doesNotMatch(page, /United States/);
  assert.ok(SITEMAP_STATIC_PATHS.includes("/cities"));
  assert.match(src("public/sitemap.xml"), /<loc>https:\/\/www\.kidease\.ca\/cities<\/loc>/);
  assert.match(src("public/sitemap.xml"), /<loc>https:\/\/www\.kidease\.ca\/daycare\/city\/winnipeg<\/loc>/);
  assert.match(src("src/routeTree.gen.ts"), /id: '\/cities'/);
});

test("nearby city links appear only when location is already known", () => {
  assert.deepEqual(nearbyHomeCities({ lat: 49.8951, lng: -97.1384, label: "Winnipeg, MB", source: "default" }), []);
  assert.deepEqual(nearbyHomeCities(null), []);
  const toronto = nearbyHomeCities({
    lat: 43.6532,
    lng: -79.3832,
    label: "Toronto, ON",
    source: "manual",
    explicit: true,
  });
  assert.ok(toronto.length >= 3 && toronto.length <= 4);
  assert.ok(toronto.some((city) => city.slug === "hamilton"));
  assert.ok(!toronto.some((city) => city.slug === "toronto"));
  const winnipeg = nearbyHomeCities({
    lat: 49.8951,
    lng: -97.1384,
    label: "Winnipeg, MB",
    source: "ip",
  });
  assert.deepEqual(winnipeg, []);
});
