import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compareEmptyKey, featPayBodyKey, tx } from "../src/lib/copy.ts";
import { loadExtraCopy } from "../src/lib/extra-copy.ts";
import { dailyCapDollars, isDerivedFromDailyCap, knownListingMonthlyFee, publicMonthlyFee } from "../src/lib/listing-fee.ts";
import { parsePioneerSearch } from "../src/lib/pioneer-filters.ts";
import { publicAgeSourceUrl } from "../src/lib/standard-age-groups.ts";
import { storeListingsLive } from "../src/lib/store-review.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a daily cap is not printed as a monthly fee", () => {
  assert.equal(isDerivedFromDailyCap(217.5, 10), true);
  assert.equal(isDerivedFromDailyCap(217, 10), true);
  assert.equal(isDerivedFromDailyCap(900, 10), false);
  assert.equal(knownListingMonthlyFee({ programDaily: 10, province: "MB", feeProgram: "mb-10-day" }, "preschool"), null);
  assert.equal(publicMonthlyFee(217, { province: "MB", feeProgram: "mb-10-day" }), null);
  const skProgram = { province: "SK", feeProgram: "sk-10-day", agesKnown: true, ageMinMonths: 0, ageMaxMonths: 60 };
  assert.equal(dailyCapDollars({ province: "SK" }), null);
  assert.equal(dailyCapDollars(skProgram), 10);
  assert.equal(publicMonthlyFee(217.5, skProgram), null);
  assert.equal(publicMonthlyFee(900, { province: "ON", feeConfidence: "centre" }), 900);
  assert.equal(publicMonthlyFee(217.5, { ...skProgram, feeConfidence: "centre" }), 217.5);
});

test("French program chip uses spoken and leaves the site language alone", () => {
  const parsed = parsePioneerSearch({ spoken: "fr", lang: "de" });
  assert.equal(parsed.spoken, "fr");
  assert.equal("lang" in parsed, false);
  const search = src("src/routes/search.tsx");
  assert.match(search, /spoken: next\.spoken/);
  assert.doesNotMatch(search, /lang: next\.lang/);
});

test("store buttons stay off until the listings config is on", () => {
  const previous = process.env.VITE_STORE_LISTINGS_LIVE;
  delete process.env.VITE_STORE_LISTINGS_LIVE;
  assert.equal(storeListingsLive(), false);
  process.env.VITE_STORE_LISTINGS_LIVE = "1";
  assert.equal(storeListingsLive(), true);
  if (previous == null) delete process.env.VITE_STORE_LISTINGS_LIVE;
  else process.env.VITE_STORE_LISTINGS_LIVE = previous;
  const page = src("src/routes/get-app.tsx");
  assert.match(page, /AMAZON_APPSTORE_URL\(\)/);
  assert.match(src("src/components/store-badges.tsx"), /storeComingSoonTitle/);
  assert.doesNotMatch(page, /Ready for App Store/);
  assert.doesNotMatch(page, /apps\.apple\.com/);
});

test("listing age source is a link, not the machine note", () => {
  const raw =
    'licensing_groups+regulation: ages_served="Infant, Preschool"; Manitoba Child Care Regulation 62/86 s.1';
  assert.equal(publicAgeSourceUrl(raw), null);
  assert.equal(
    publicAgeSourceUrl("https://web2.gov.mb.ca/laws/regs/current/_pdf-regs.php?reg=62%2F86 ; https://example.com"),
    "https://web2.gov.mb.ca/laws/regs/current/_pdf-regs.php?reg=62%2F86",
  );
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /agesFromProvince/);
  assert.doesNotMatch(listing, /provinceAgeSourceText/);
  assert.doesNotMatch(listing, /provinceAgeCaption/);
});

test("Parent Plus copy stays off the public pages while subscriptions are off", async () => {
  await loadExtraCopy("de");
  assert.equal(compareEmptyKey(false), "compareEmptyFree");
  assert.equal(compareEmptyKey(true), "compareEmpty");
  assert.equal(featPayBodyKey(false), "featPayBodyBills");
  assert.equal(featPayBodyKey(true), "featPayBody");
  assert.doesNotMatch(tx("en", "compareEmptyFree"), /Parent Plus/);
  assert.doesNotMatch(tx("fr", "featPayBodyBills"), /Plus parents|Parent Plus/);
  assert.doesNotMatch(tx("de", "featPayBodyBills"), /Personal geprüft|Parent Plus/);
  assert.match(tx("en", "stickyInfo"), /^Info$/);
  assert.match(tx("de", "stickyMessage"), /Nachricht/);
  assert.match(tx("fr", "bookTour"), /Réserver/);
  assert.doesNotMatch(tx("en", "storeComingSoonTitle"), /Ready for/);
  assert.match(tx("en", "enrollToday"), /Enrol today/);
  assert.doesNotMatch(tx("en", "enrollToday"), /Enroll/);
});

test("phone sticky actions keep whole words and a 44px target", () => {
  const css = src("src/styles.css");
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(css, /\.ke-sticky-label[\s\S]*overflow-wrap: normal/);
  assert.match(css, /\.ke-sticky-label[\s\S]*word-break: normal/);
  assert.match(listing, /data-ke="listing-sticky-bar"/);
  assert.match(listing, /min-h-11/);
  assert.match(listing, /stickyInfo/);
  assert.match(listing, /stickyMessage/);
});
