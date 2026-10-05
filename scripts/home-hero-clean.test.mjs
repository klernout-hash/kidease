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

test("home hero has no city pills and no Browse by city link", () => {
  const home = src("src/routes/index.tsx");
  const hero = home.slice(home.indexOf("from-soft"), home.indexOf('id="how"'));
  assert.doesNotMatch(hero, /HomePopularCities/);
  assert.doesNotMatch(hero, /<CityHubLinks/);
  assert.doesNotMatch(hero, /CITY_CHIPS/);
  assert.doesNotMatch(hero, /heroPopular/);
  assert.doesNotMatch(hero, /heroCityBrowse/);
  assert.doesNotMatch(hero, /browseCities/);
  assert.equal((home.match(/data-ke="browse-cities"/g) ?? []).length, 0);
  assert.doesNotMatch(home, /<CityHubLinks/);
  assert.doesNotMatch(src("src/routes/fr.index.tsx"), /<CityHubLinks/);
  assert.match(src("src/routes/fr.index.tsx"), /<HomePage/);
  assert.doesNotMatch(src("src/routes/fr.index.tsx"), /to="\/cities"/);
  assert.match(src("src/components/place-search.tsx"), /data-ke="where-nearby"/);
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
  const app = home.slice(home.indexOf("ke-app-only"));
  assert.equal((web.match(/<TrustBar/g) ?? []).length, 1);
  assert.equal((app.match(/<TrustBar/g) ?? []).length, 1);
  assert.match(copy, /trustBarLead: "Licensed centres only\. Screening on file means required documents were reviewed; KidEase does not run police checks\."/);
  assert.match(copy, /trustBarLead: "Centres permis seulement\. Dossier de filtrage signifie que les documents requis ont été examinés ; KidEase ne fait pas de contrôle policier\."/);
  assert.match(copy, /homeTrustVerify: "How we verify"/);
  assert.match(copy, /homeTrustVerify: "Comment nous vérifions"/);
  assert.doesNotMatch(copy, /trustBarLead:[\s\S]{0,220}—/);
  assert.match(home, /<SmartMatchEntry inline quiet/);
  assert.match(home, /<ResumeVisitCard quiet/);
  assert.match(src("src/components/trust-bar.tsx"), /data-ke="home-trust-line"/);
  assert.match(src("src/components/trust-bar.tsx"), /localePath\("\/verify"/);
  assert.doesNotMatch(src("src/components/trust-bar.tsx"), /grid-cols-2/);
  assert.doesNotMatch(src("src/components/trust-bar.tsx"), /trustLicensedOnly/);
  assert.doesNotMatch(home, /OptionalUpgrades/);
  assert.doesNotMatch(home, /showPayCtas/);
});

test("home search bar is a slim pill with a claim strip and a daycare header pill", () => {
  const bar = src("src/components/explore-search-bar.tsx");
  const home = src("src/routes/index.tsx");
  const fr = src("src/routes/fr.index.tsx");
  const shell = src("src/components/shell.tsx");
  const copy = src("src/lib/copy.ts");
  const strip = src("src/components/hero-claim-strip.tsx");
  assert.match(bar, /lg:h-\[56px\]/);
  assert.match(bar, /whitespace-nowrap text-\[16px\] font-semibold leading-5 text-fg/);
  assert.match(bar, /!text-\[12px\] font-normal leading-4 text-muted/);
  assert.match(bar, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_minmax\(0,1fr\)_auto\]/);
  assert.doesNotMatch(bar, /lg:flex-\[2\.4\]/);
  assert.doesNotMatch(bar, /lg:flex-\[0\.85\]/);
  assert.doesNotMatch(bar, /lg:flex-\[1\.05\]/);
  assert.match(bar, /lg:before:w-px/);
  assert.match(bar, /quiet=\{prominent\}/);
  assert.match(bar, /prominent \? "size-\[44px\]"/);
  assert.match(home, /max-w-\[960px\]/);
  assert.match(home, /data-ke="home-hero-pills"[\s\S]*?<HeroClaimStrip/);
  assert.match(fr, /<HomePage/);
  assert.match(fr, /pageSeoHead\(MARKETING_PAGE_SEO_FR\.home\)/);
  assert.match(fr, /loadProductHome/);
  assert.doesNotMatch(fr, /clamp\(2rem,6vw,3\.25rem\)/);
  assert.match(strip, /data-ke="home-claim-strip"/);
  assert.match(strip, /localePath\("\/claim"/);
  assert.match(copy, /heroDaycareLead: "Run a daycare\? Claim your free listing in 2 minutes"/);
  assert.match(copy, /heroDaycareLead: "Vous gérez une garderie\? Réclamez votre fiche gratuite en 2 minutes"/);
  assert.match(copy, /heroClaimListing: "Claim listing"/);
  assert.match(copy, /heroClaimListing: "Réclamer la fiche"/);
  assert.match(copy, /heroTrustLicensed: "Licensed centres only"/);
  assert.match(copy, /heroTrustLicensed: "Centres permis seulement"/);
  assert.match(copy, /heroTrustCount: "20,000\+ centres listed"/);
  assert.match(copy, /heroTrustCount: "Plus de 20 000 centres inscrits"/);
  assert.match(copy, /heroTrustFounding: "Free founding period"/);
  assert.match(copy, /heroTrustFounding: "Période fondatrice gratuite"/);
  assert.doesNotMatch(strip, /free forever/i);
  assert.doesNotMatch(strip, /—/);
  const link = shell.slice(shell.indexOf('data-ke="list-your-daycare"') - 80, shell.indexOf('data-ke="list-your-daycare"') + 500);
  assert.match(link, /border-primary/);
  assert.match(link, /Building2/);
  assert.match(link, /navForDaycares/);
  assert.match(link, /whitespace-nowrap/);
  assert.doesNotMatch(link, /hidden md:inline-flex/);
  assert.doesNotMatch(link, /listYourDaycare/);
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
  assert.match(page, /localePath\(`\/daycare\/city\/\$\{city\.slug\}`, locale\)/);
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
