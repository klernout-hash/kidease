import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("nearby search returns catalogue instead of awaiting a Neon import", () => {
  const nearby = src("src/lib/server/nearby.ts");
  assert.match(nearby, /void importCatalogSlice/);
  assert.doesNotMatch(nearby, /await importCatalogSlice\(sql, fallback\)/);
  assert.match(nearby, /nearby-sql-timeout/);
});

test("listing detail can render catalogue data when Neon is down", () => {
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /catalogPayload/);
  assert.match(daycares, /listing-sql-timeout/);
  assert.match(daycares, /catch \{\s*return catalogPayload;/);
});

test("search and listing recover from hung fetches", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /searchFailed/);
  assert.match(search, /12_000/);
  assert.match(search, /retrySearch/);
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /\.catch\(/);
  assert.match(listing, /12_000/);
  assert.match(listing, /tryAgain/);
  assert.match(listing, /displayCentreName/);
  assert.match(listing, /if \(!live\) return;/);
});

test("unsigned provider desk settles the session and offers sign-in or claim", () => {
  const hook = src("src/lib/auth/use-current-user.ts");
  assert.match(hook, /export function useSettledUser/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /useSettledUser/);
  assert.match(provider, /providerGuestSignIn/);
  assert.match(provider, /providerGuestClaim/);
  assert.match(provider, /role: "provider"/);
  assert.match(provider, /next: "\/provider"/);
  assert.match(provider, /to="\/claim"/);
  assert.doesNotMatch(provider, /<Navigate to="\/login"/);
});

test("FAQ is a real page and registry names get hyphen spacing", () => {
  const faq = src("src/routes/faq.tsx");
  assert.match(faq, /function FaqPage/);
  assert.doesNotMatch(faq, /redirect\(\{ to: "\/tour-checklist" \}\)/);
  const vercel = src("vercel.json");
  assert.doesNotMatch(vercel, /"source": "\/faq"/);
  assert.doesNotMatch(vercel, /funding-checklist/);
  const utils = src("src/lib/utils.ts");
  assert.match(utils, /\\bCetnre\\b/);
  assert.match(utils, /\\s\+-\\s\*/);
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /notOnKidEase/);
  assert.match(card, /placeholder/);
  const origin = src("src/lib/search-origin.ts");
  assert.match(origin, /locationConsent !== "granted"/);
});

test("listing On the map uses Maps JS, not a broken embed iframe", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  const map = src("src/components/listing-map.tsx");
  assert.match(listing, /ListingMap/);
  assert.doesNotMatch(listing, /output=embed/);
  assert.doesNotMatch(listing, /<iframe/);
  assert.doesNotMatch(listing, /maps\.google\.com\/maps\?/);
  assert.match(map, /loadGoogleMaps/);
  assert.match(map, /listingMapConstructorOptions/);
  assert.match(map, /ke-logo-pin/);
  assert.doesNotMatch(map, /<iframe/);
  assert.doesNotMatch(map, /maps\.google\.com/);
});

test("sitemap lists /faq separately from the tour checklist", () => {
  const sitemap = src("public/sitemap.xml");
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/faq/);
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/tour-checklist/);
});
