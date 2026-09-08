import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildCityHubSnapshots,
  CITY_HUB_MIN_LISTINGS,
  cityHubDefForPlace,
  cityHubPath,
  cityHubUrl,
  sitemapCityHubPaths,
} from "../src/lib/city-hubs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("city hub URLs sit under /daycare/city and never invent empty cities", () => {
  assert.equal(cityHubPath("winnipeg"), "/daycare/city/winnipeg");
  assert.equal(cityHubUrl("winnipeg"), "https://www.kidease.ca/daycare/city/winnipeg");
  assert.equal(cityHubDefForPlace("Winnipeg", "MB")?.slug, "winnipeg");
  assert.equal(cityHubDefForPlace("Montréal", "QC")?.slug, "montreal");
  assert.equal(cityHubDefForPlace("Winnipegosis", "MB"), null);
  assert.equal(cityHubDefForPlace("Winnipeg", "ON"), null);

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
  assert.match(src("src/lib/city-hubs.ts"), /city: "Montréal"/);

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
  assert.match(footer, /cityHubPath/);
});
