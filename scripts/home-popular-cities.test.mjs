import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { WINNIPEG } from "../src/lib/geo.ts";
import {
  POPULAR_HOME_CITY_LIMIT,
  POPULAR_HOME_CITY_SLUGS,
  hubLatLng,
  pickPopularHomeLead,
  popularHomeCities,
} from "../src/lib/home-popular-cities.ts";
import { CITY_HUB_DEFS, cityHubDefBySlug } from "../src/lib/city-hubs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("popular home cities stay a short Winnipeg-first set", () => {
  assert.deepEqual([...POPULAR_HOME_CITY_SLUGS], [
    "winnipeg",
    "toronto",
    "vancouver",
    "calgary",
    "montreal",
    "edmonton",
  ]);
  assert.equal(POPULAR_HOME_CITY_LIMIT, 6);
  assert.equal(POPULAR_HOME_CITY_SLUGS[0], "winnipeg");
  assert.notEqual(POPULAR_HOME_CITY_SLUGS[0], "toronto");

  const cities = popularHomeCities(null, "en");
  assert.deepEqual(
    cities.map((c) => c.slug),
    ["winnipeg", "toronto", "vancouver", "calgary", "montreal", "edmonton"],
  );
  assert.deepEqual(
    cities.map((c) => c.label),
    ["Winnipeg", "Toronto", "Vancouver", "Calgary", "Montreal", "Edmonton"],
  );
  assert.equal(cities[0].q, "Winnipeg");
  assert.equal(popularHomeCities(null, "fr").find((c) => c.slug === "montreal")?.label, "Montréal");
});

test("nearby trusted geo leads the popular list; inferred Toronto does not", () => {
  const calgary = popularHomeCities({
    lat: 51.0447,
    lng: -114.0719,
    label: "Calgary, AB",
    source: "gps",
  });
  assert.equal(calgary[0].slug, "calgary");
  assert.ok(calgary.some((c) => c.slug === "winnipeg"));
  assert.equal(calgary.length, 6);

  const vancouverIp = popularHomeCities({
    lat: 49.2827,
    lng: -123.1207,
    label: "Vancouver, BC",
    source: "ip",
  });
  assert.equal(vancouverIp[0].slug, "vancouver");

  const inferredToronto = popularHomeCities({
    lat: 43.6532,
    lng: -79.3832,
    label: "Toronto, ON",
    source: "ip",
  });
  assert.equal(inferredToronto[0].slug, "winnipeg");
  assert.ok(inferredToronto.some((c) => c.slug === "toronto"));

  const chosenToronto = popularHomeCities({
    lat: 43.6532,
    lng: -79.3832,
    label: "Toronto, ON",
    source: "manual",
    explicit: true,
  });
  assert.equal(chosenToronto[0].slug, "toronto");

  const mbTz = popularHomeCities({
    lat: 43.6532,
    lng: -79.3832,
    label: "Toronto, ON",
    source: "ip",
    timeZone: "America/Winnipeg",
  });
  assert.equal(mbTz[0].slug, "winnipeg");

  const ottawa = popularHomeCities({
    lat: 45.4215,
    lng: -75.6972,
    label: "Ottawa, ON",
    source: "gps",
  });
  assert.equal(ottawa[0].slug, "ottawa");
  assert.equal(ottawa.length, 6);
  assert.ok(!ottawa.some((c) => c.slug === "edmonton"));

  assert.equal(pickPopularHomeLead({ label: "Winnipeg, MB" }).slug, "winnipeg");
  assert.ok(hubLatLng(cityHubDefBySlug("quebec-city")));
  assert.ok(hubLatLng(CITY_HUB_DEFS[0]));
  assert.equal(hubLatLng(cityHubDefBySlug("winnipeg"))?.lat, WINNIPEG.lat);
});

test("guest home hero no longer duplicates Explore filter chips or the city grid", () => {
  const home = src("src/routes/index.tsx");
  const hero = home.slice(home.indexOf("from-soft"), home.indexOf('id="how"'));
  const form = home.slice(home.indexOf("const locationForm"), home.indexOf("const featuredSearch"));
  assert.match(form, /HomePopularCities/);
  assert.match(form, /PlaceSearch/);
  assert.match(form, /t\("search"\)/);
  assert.doesNotMatch(form, /ChipButton/);
  assert.doesNotMatch(hero, /hero-trust-chips/);
  assert.doesNotMatch(hero, /t\("trustLicensedOnly"\)/);
  assert.doesNotMatch(hero, /t\("sortOpen"\)/);
  assert.doesNotMatch(hero, /t\("requestInfo"\)/);
  assert.match(hero, /t\("heroTrust"\)/);
  assert.match(hero, /HeroYard/);
  assert.match(src("src/components/home-popular-cities.tsx"), /overflow-x-auto/);
  assert.match(src("src/components/home-popular-cities.tsx"), /sm:flex-wrap/);
});
