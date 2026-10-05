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
  cityHubMapSearchQuery,
  cityHubSearchQuery,
  cityHubUrl,
  sitemapCityHubPaths,
} from "../src/lib/city-hubs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("home chips keep Kyle's 10, then Moncton, as City, Province labels", () => {
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
      "moncton",
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
      "Moncton, New Brunswick",
    ],
  );
  assert.equal(cityHubChipLabel(CITY_HUB_DEFS.find((h) => h.slug === "moncton"), "fr"), "Moncton, Nouveau-Brunswick");
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
  assert.equal(cityHubDefForPlace("Moncton", "NB")?.slug, "moncton");
  assert.equal(cityHubDefForPlace("Winnipegosis", "MB"), null);
  assert.equal(cityHubDefForPlace("Winnipeg", "ON"), null);
  const quebecHit = geocode(cityHubSearchQuery(CITY_HUB_DEFS.find((h) => h.slug === "quebec-city")));
  assert.ok(quebecHit);
  assert.match(quebecHit.label, /Québec City|Quebec City/i);
  assert.doesNotMatch(quebecHit.label, /Montréal|Montreal/i);
  for (const hub of CITY_HUB_DEFS) {
    assert.ok(geocode(cityHubSearchQuery(hub)), hub.slug);
    const query = cityHubMapSearchQuery(hub);
    assert.equal(query, `${hub.cityEn}, ${hub.province}`);
    const hit = geocode(query);
    assert.ok(hit, query);
    assert.equal(hit.lat, geocode(hub.cityEn)?.lat);
  }
  assert.equal(cityHubMapSearchQuery(cityHubDefBySlug("winnipeg")), "Winnipeg, MB");
  assert.equal(cityHubMapSearchQuery(cityHubDefBySlug("toronto")), "Toronto, ON");

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
    "moncton",
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
    [
      ...hubs.map((h) => `/daycare/city/${h.slug}`),
      ...hubs.map((h) => `/fr/daycare/city/${h.slug}`),
    ],
  );
});

test("guest home links Browse by city and does not render city pills", () => {
  const home = src("src/routes/index.tsx");
  const web = home.slice(home.indexOf("ke-web-only"), home.indexOf("ke-app-only"));
  const hero = web.slice(web.indexOf("from-soft"), web.indexOf('id="how"'));
  assert.doesNotMatch(hero, /HomePopularCities/);
  assert.doesNotMatch(hero, /<CityHubLinks/);
  assert.doesNotMatch(hero, /CITY_CHIPS/);
  assert.doesNotMatch(hero, /heroCityBrowse/);
  assert.doesNotMatch(hero, /browseCities/);
  assert.match(src("src/lib/city-hubs.ts"), /city: "Montréal"/);
  assert.match(src("src/lib/city-hubs.ts"), /cityEn: "Montreal"/);
  assert.doesNotMatch(web, /hero-trust-chips/);
  assert.doesNotMatch(web, /t\("requestInfo"\)/);
  assert.doesNotMatch(web, /t\("heroTrust"\)/);

  const app = home.slice(home.indexOf("ke-app-only"));
  assert.doesNotMatch(app, /CITY_CHIPS/);
  assert.equal((app.match(/<CityHubLinks/g) ?? []).length, 0);
  assert.doesNotMatch(app, /heroCityBrowse/);
});

test("French city hubs read their own loader instead of the English route hook", () => {
  const en = src("src/routes/daycare.city.$city.tsx");
  const fr = src("src/routes/fr.daycare.city.$city.tsx");
  assert.match(en, /function EnglishCityHubPage\(\)/);
  assert.match(en, /component: EnglishCityHubPage/);
  assert.match(en, /export function CityHubPage\(\{ hub \}/);
  const page = en.slice(en.indexOf("export function CityHubPage"));
  assert.doesNotMatch(page, /useLoaderData/);
  assert.match(fr, /function FrenchCityHubPage\(\)/);
  assert.match(fr, /component: FrenchCityHubPage/);
  assert.match(fr, /const hub = Route\.useLoaderData\(\)/);
  assert.match(fr, /<CityHubPage hub=\{hub\} \/>/);
});

test("hub route, listing breadcrumbs, and internal links are wired", () => {
  const hubRoute = src("src/routes/daycare.city.$city.tsx");
  const hubPage = src("src/lib/city-hub-page.ts");
  assert.match(hubRoute, /createFileRoute\("\/daycare\/city\/\$city"\)/);
  assert.match(hubPage, /throw notFound\(\)/);
  assert.match(hubRoute, /CityHubNotFoundPage/);
  assert.match(hubPage, /cityHubNotFoundHead/);
  assert.doesNotMatch(hubRoute + hubPage, /redirect\(\{\s*to:\s*"\/search"/);
  assert.match(hubRoute, /cityHubMapSearchQuery/);
  assert.equal((hubRoute.match(/search=\{\{\s*q:\s*mapSearch\s*\}\}/g) ?? []).length, 2);
  assert.doesNotMatch(hubRoute, /<Link to="\/search">/);
  assert.match(hubPage, /pageSeoHead/);
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
  const cities = src("src/routes/cities.tsx");
  assert.doesNotMatch(home, /CityHubLinks/);
  assert.match(search, /CityHubLinks/);
  assert.match(cities, /localePath\(`\/daycare\/city\/\$\{city\.slug\}`, locale\)/);
  assert.doesNotMatch(footer, /cityHubPath/);
  assert.doesNotMatch(footer, /cityHubs\(\)/);
});
