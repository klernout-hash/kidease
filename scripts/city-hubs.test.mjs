import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { geocode } from "../src/lib/geo.ts";
import {
  buildCityHubSnapshots,
  CITY_HUB_DEFS,
  CITY_HUB_MIN_LISTINGS,
  cityHubChipLabel,
  cityHubDefBySlug,
  cityHubDefForPlace,
  cityHubPath,
  cityHubSearchQuery,
  cityHubUrl,
  sitemapCityHubPaths,
} from "../src/lib/city-hubs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("home chips are Kyle's 10 City, Province labels in order", () => {
  assert.deepEqual(
    CITY_HUB_DEFS.map((hub) => hub.slug),
    [
      "toronto",
      "montreal",
      "vancouver",
      "calgary",
      "edmonton",
      "ottawa",
      "winnipeg",
      "quebec-city",
      "hamilton",
      "halifax",
    ],
  );
  assert.deepEqual(
    CITY_HUB_DEFS.map((hub) => cityHubChipLabel(hub, "en")),
    [
      "Toronto, Ontario",
      "Montreal, Quebec",
      "Vancouver, British Columbia",
      "Calgary, Alberta",
      "Edmonton, Alberta",
      "Ottawa, Ontario",
      "Winnipeg, Manitoba",
      "Quebec City, Quebec",
      "Hamilton, Ontario",
      "Halifax, Nova Scotia",
    ],
  );
  assert.equal(cityHubChipLabel(CITY_HUB_DEFS.find((h) => h.slug === "montreal"), "fr"), "Montréal, Québec");
  assert.equal(cityHubChipLabel(CITY_HUB_DEFS.find((h) => h.slug === "quebec-city"), "fr"), "Québec, Québec");
  assert.equal(cityHubDefBySlug("quebec-city")?.slug, "quebec-city");
  assert.equal(cityHubDefBySlug("quebeccity")?.slug, "quebec-city");
});

test("city hub URLs sit under /daycare/city and never invent empty cities", () => {
  assert.equal(cityHubPath("winnipeg"), "/daycare/city/winnipeg");
  assert.equal(cityHubUrl("winnipeg"), "https://www.kidease.ca/daycare/city/winnipeg");
  assert.equal(cityHubPath("quebec-city"), "/daycare/city/quebec-city");
  assert.equal(cityHubDefForPlace("Winnipeg", "MB")?.slug, "winnipeg");
  assert.equal(cityHubDefForPlace("Montréal", "QC")?.slug, "montreal");
  assert.equal(cityHubDefForPlace("Edmonton", "AB")?.slug, "edmonton");
  assert.equal(cityHubDefForPlace("Québec", "QC")?.slug, "quebec-city");
  assert.equal(cityHubDefForPlace("Quebec City", "QC")?.slug, "quebec-city");
  assert.equal(cityHubDefForPlace("Hamilton", "ON")?.slug, "hamilton");
  assert.equal(cityHubDefForPlace("Halifax", "NS")?.slug, "halifax");
  assert.equal(cityHubDefForPlace("Winnipegosis", "MB"), null);
  assert.equal(cityHubDefForPlace("Winnipeg", "ON"), null);
  const quebecHit = geocode(cityHubSearchQuery(CITY_HUB_DEFS.find((h) => h.slug === "quebec-city")));
  assert.ok(quebecHit);
  assert.match(quebecHit.label, /Québec City|Quebec City/i);
  assert.doesNotMatch(quebecHit.label, /Montréal|Montreal/i);
  for (const hub of CITY_HUB_DEFS) {
    assert.ok(geocode(cityHubSearchQuery(hub)), hub.slug);
  }

  const hubs = buildCityHubSnapshots([
    { slug: "test-ghost-claim-lab", name: "Ghost", city: "Winnipeg", province: "MB", visibility: "admin_only" },
    { slug: "alpha-centre-1", name: "Alpha", city: "Winnipeg", province: "MB" },
    { slug: "beta-centre-2", name: "Beta", city: "Winnipeg", province: "MB" },
    { slug: "toronto-only-3", name: "T", city: "Toronto", province: "ON" },
  ]);
  assert.equal(hubs.some((h) => h.slug === "winnipeg"), false);
  assert.ok(CITY_HUB_MIN_LISTINGS > 2);
});

test("generated city-hubs.json keeps Winnipeg and other dense cities", () => {
  const path = join(root, "src/lib/data/city-hubs.json");
  assert.equal(existsSync(path), true);
  const hubs = JSON.parse(readFileSync(path, "utf8"));
  const slugs = hubs.map((h) => h.slug);
  for (const slug of [
    "toronto",
    "montreal",
    "vancouver",
    "calgary",
    "edmonton",
    "ottawa",
    "winnipeg",
    "quebec-city",
    "hamilton",
    "halifax",
  ]) {
    assert.ok(slugs.includes(slug), slug);
  }
  const winnipeg = hubs.find((h) => h.slug === "winnipeg");
  assert.ok(winnipeg);
  assert.ok(winnipeg.count >= CITY_HUB_MIN_LISTINGS);
  assert.ok(winnipeg.listings.length > 0);
  assert.ok(winnipeg.listings.length <= winnipeg.count);
  assert.equal(winnipeg.province, "MB");
  assert.match(winnipeg.listings[0].slug, /^[a-z0-9-]+$/i);
  assert.doesNotMatch(JSON.stringify(hubs), /test-ghost-claim-lab/);
  assert.deepEqual(
    sitemapCityHubPaths(hubs),
    hubs.map((h) => `/daycare/city/${h.slug}`),
  );
});

test("guest home renders each city shortcut once", () => {
  const home = src("src/routes/index.tsx");
  const form = home.slice(home.indexOf("const locationForm"), home.indexOf("const featuredSearch"));
  assert.match(form, /cityChips/);
  assert.doesNotMatch(form, /CityHubLinks/);
  assert.match(home, /CITY_HUB_DEFS\.map/);
  assert.match(home, /cityHubChipLabel/);
  assert.match(src("src/lib/city-hubs.ts"), /city: "Montréal"/);
  assert.match(src("src/lib/city-hubs.ts"), /cityEn: "Montreal"/);

  const web = home.slice(home.indexOf("ke-web-only"), home.indexOf("ke-app-only"));
  assert.equal((web.match(/<CityHubLinks/g) ?? []).length, 1);
  assert.match(web, /!manual \? <CityHubLinks/);

  const app = home.slice(home.indexOf("ke-app-only"));
  assert.match(app, /CITY_CHIPS/);
  assert.equal((app.match(/<CityHubLinks/g) ?? []).length, 0);
});

test("hub route, listing breadcrumbs, and internal links are wired", () => {
  const hubRoute = src("src/routes/daycare.city.$city.tsx");
  assert.match(hubRoute, /createFileRoute\("\/daycare\/city\/\$city"\)/);
  assert.match(hubRoute, /pageSeoHead/);
  assert.match(hubRoute, /faqPageJsonLdScript/);
  assert.match(hubRoute, /breadcrumbJsonLdScript/);
  assert.match(hubRoute, /do not list nannies or sitters/);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /listingBreadcrumbJsonLdScript/);
  assert.match(listing, /cityHubDefForPlace/);
  assert.match(listing, /\/daycare\/city\/\$city/);
  const home = src("src/routes/index.tsx");
  const search = src("src/routes/search.tsx");
  const footer = src("src/components/site-footer.tsx");
  assert.match(home, /CityHubLinks/);
  assert.match(search, /CityHubLinks/);
  assert.doesNotMatch(footer, /cityHubPath/);
  assert.doesNotMatch(footer, /cityHubs\(\)/);
});
