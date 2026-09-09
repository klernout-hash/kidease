import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isPlatformLive } from "../src/lib/live.ts";
import {
  listingBreadcrumbJsonLd,
  listingCanonicalUrl,
  listingJsonLd,
  listingMetaDescription,
  listingPageTitle,
  listingSeoMeta,
} from "../src/lib/listing-seo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const centre = {
  slug: "sunny-side-child-care",
  name: "Sunny Side Child Care",
  nameFr: "Garderie Sunny Side",
  city: "Winnipeg",
  province: "MB",
  address: "123 Main St",
  postalCode: "R3C 1A1",
  agesKnown: true,
  ageMinMonths: 12,
  ageMaxMonths: 60,
  photos: ["/photos/buildings/mb-1.jpg"],
};

test("isPlatformLive requires a real claim and never invents live", () => {
  assert.equal(isPlatformLive("mb-1", false), false);
  assert.equal(isPlatformLive("mb-1", true), true);
  assert.equal(isPlatformLive("mb-1", false, { claimedAt: "2026-09-01T00:00:00.000Z" }), true);
  assert.equal(isPlatformLive("mb-1", false, { claimStatus: "approved" }), true);
  assert.equal(isPlatformLive("mb-1", false, { claimStatus: "pending" }), false);
  assert.equal(isPlatformLive("mb-1", true, { claimStatus: "declined" }), false);
  assert.equal(isPlatformLive("mb-1", true, { listingActive: false }), false);
  assert.equal(isPlatformLive("mb-1", true, { ratingX10: 20, reviewCount: 4 }), false);
  assert.equal(isPlatformLive("mb-1", true, { ratingX10: 40, reviewCount: 4 }), true);
  assert.equal(isPlatformLive("mb-1", true, { ratingX10: 0, reviewCount: 0 }), true);
});

test("listing SEO title and description use name, city, province, ages", () => {
  const title = listingPageTitle(centre, "en");
  assert.match(title, /Sunny Side Child Care/);
  assert.match(title, /Winnipeg/);
  assert.match(title, /MB/);
  assert.match(title, /12–60 months/);
  assert.match(title, /KidEase/);
  const desc = listingMetaDescription(centre, "en");
  assert.match(desc, /Licensed centre at Sunny Side Child Care/);
  assert.match(desc, /Winnipeg/);
  assert.doesNotMatch(desc, /\$10/);
  assert.doesNotMatch(desc, /4\.8/);
  const fr = listingPageTitle(centre, "fr");
  assert.match(fr, /Garderie Sunny Side/);
  assert.match(fr, /12 à 60 mois/);
});

test("listing SEO and JSON-LD fail closed when name, url, or area is missing", () => {
  assert.equal(listingPageTitle({ slug: "x" }), "");
  assert.equal(listingMetaDescription({ slug: "x", city: "Winnipeg" }), "");
  assert.equal(listingSeoMeta({ name: "Sunny", city: "Winnipeg" }), null);
  assert.equal(listingCanonicalUrl(""), "");
  assert.equal(listingJsonLd({ slug: "sunny-side-child-care", name: "Sunny" }), null);
  assert.equal(listingJsonLd({ slug: "sunny-side-child-care", city: "Winnipeg" }), null);
  assert.ok(listingJsonLd(centre));
});

test("JSON-LD is ChildCare / LocalBusiness and never invents ratings", () => {
  const json = listingJsonLd(centre);
  assert.equal(json["@context"], "https://schema.org");
  assert.deepEqual(json["@type"], ["ChildCare", "LocalBusiness"]);
  assert.equal(json.name, "Sunny Side Child Care");
  assert.equal(json.url, "https://www.kidease.ca/daycare/sunny-side-child-care");
  assert.equal(json.address.addressLocality, "Winnipeg");
  assert.equal(json.address.addressRegion, "MB");
  assert.equal(json.address.addressCountry, "CA");
  assert.equal(json.alternateName, "Garderie Sunny Side");
  assert.equal("aggregateRating" in json, false);
  assert.equal("review" in json, false);
  const text = JSON.stringify(json);
  assert.doesNotMatch(text, /aggregateRating/);
  assert.doesNotMatch(text, /ratingValue/);
});

test("PostGIS claimed_at reaches live mapping and overlay is scoped to result ids", () => {
  const neon = src("src/lib/server/catalog-neon.ts");
  assert.match(neon, /claimed: Boolean\(row\.claimed_at\)/);
  assert.match(neon, /claim_status, listing_active/);
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /claimed: Boolean\(d\.claimed \|\| d\.claimedAt\)/);
  assert.match(daycares, /isPlatformLive\(d\.id, Boolean\(d\.claimed \|\| d\.claimedAt\)/);
  assert.doesNotMatch(daycares, /live: isPlatformLive\(d\.id, false\)/);
  assert.doesNotMatch(daycares, /daycare\.live = isPlatformLive/);
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /id = any\(\$1::text\[\]\)/);
  assert.match(claims, /claimed_at is not null/);
});

test("listing breadcrumbs include the city hub when one exists", () => {
  const crumbs = listingBreadcrumbJsonLd(centre);
  assert.equal(crumbs["@type"], "BreadcrumbList");
  assert.equal(crumbs.itemListElement[1].item, "https://www.kidease.ca/daycare/city/winnipeg");
  assert.match(crumbs.itemListElement[1].name, /Winnipeg/);
  assert.equal(crumbs.itemListElement[2].item, "https://www.kidease.ca/daycare/sunny-side-child-care");
});

test("listing route sets unique head tags and JSON-LD; grok OG does not overwrite /daycare/", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /getListingSeo/);
  assert.match(listing, /throw notFound\(\)/);
  assert.match(listing, /listingSeoHeadTags/);
  assert.match(listing, /application\/ld\+json/);
  assert.match(listing, /listingJsonLdScript/);
  assert.match(listing, /listingBreadcrumbJsonLdScript/);
  const grok = src("server/middleware/grok-pwa.ts");
  assert.match(grok, /path\.startsWith\("\/daycare\/"\)/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /noLiveResultsClaim: "Directors: claim your listing"/);
  assert.match(copy, /noLiveResultsClaim: "Directeurs : réclamez votre fiche"/);
  assert.match(copy, /liveToggleCount: "Live · \{n\}"/);
  assert.match(copy, /liveToggleCount: "En ligne · \{n\}"/);
  const search = src("src/routes/search.tsx");
  assert.match(search, /fabric\.live > 0/);
  assert.match(search, /noLiveResultsClaim/);
  assert.match(search, /secondaryTo: "\/claim"/);
  assert.doesNotMatch(search, /\{t\("liveOnly"\)\} · \{fabric\.live\}/);
});
