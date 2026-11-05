import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { airbnbAccountRows, airbnbPublicPlace, freshnessLine, maskEmail, maskPhone } from "../src/lib/airbnb-ui.ts";
import { airbnbCopy } from "../src/lib/airbnb-ui-copy.ts";
import { FLAG_DEFAULTS, FEATURE_FLAG_KEYS } from "../src/lib/flags.ts";
import { airbnbUiEnabled } from "../src/lib/features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("FEATURE_UI_AIRBNB_V1 stays off", () => {
  assert.equal(FEATURE_FLAG_KEYS.includes("FEATURE_UI_AIRBNB_V1"), true);
  assert.equal(FLAG_DEFAULTS.FEATURE_UI_AIRBNB_V1, false);
  assert.equal(airbnbUiEnabled({}), false);
  assert.equal(airbnbUiEnabled({ FEATURE_UI_AIRBNB_V1: "1" }), true);
  assert.equal(airbnbUiEnabled({ FEATURE_UI_AIRBNB_V1: "0" }), false);
  assert.match(src(".env.example"), /^FEATURE_UI_AIRBNB_V1=0$/m);
  assert.match(src("docs/flags.md"), /FEATURE_UI_AIRBNB_V1/);
});

test("flag off does not add the airbnb attribute or home class", () => {
  const rootSrc = src("src/routes/__root.tsx");
  assert.match(rootSrc, /readAirbnbUi\(\)/);
  const home = src("src/routes/index.tsx");
  // The phone home keeps the classic map, list, and hero even when the flag is on.
  assert.doesNotMatch(home, /<AirbnbHome/);
  assert.doesNotMatch(home, /ke-airbnb-hide-phone/);
  assert.match(home, /<AirbnbCareCategories/);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.doesNotMatch(listing, /AirbnbListingPhone/);
  assert.doesNotMatch(listing, /ke-airbnb-hide-phone/);
  const menu = src("src/components/app-menu-screen.tsx");
  assert.match(menu, /PhoneCategoryMenu/);
  assert.match(src("src/components/phone-category-menu.tsx"), /Your centre/);
  assert.match(src("src/components/phone-category-menu.tsx"), /data-ke="menu-sign-out"/);
  assert.doesNotMatch(src("src/components/phone-category-menu.tsx"), /subscription|upgrade/i);
});

test("phone and email masks and home addresses stay private", () => {
  assert.equal(maskPhone("+1 204 555 1916"), "+1 ***-***-1916");
  assert.equal(maskEmail("kyle@example.com"), "k•••e@example.com");
  assert.equal(maskEmail("a@example.com"), "a•••@example.com");
  const place = airbnbPublicPlace({
    city: "Winnipeg",
    address: "123 Secret Street",
    addressProtected: true,
    facilityType: "family_home",
    addressPlace: "Winnipeg · R3T",
  });
  assert.equal(place, "Winnipeg · R3T");
  assert.doesNotMatch(place, /Secret/);
  assert.equal(freshnessLine("", "en"), "");
  assert.match(freshnessLine(new Date().toISOString(), "en"), /Updated today/);
  assert.match(freshnessLine(new Date().toISOString(), "fr"), /aujourd/);
});

test("account hub has no pay, subscribe, or upgrade copy", () => {
  const rows = airbnbAccountRows(true);
  assert.deepEqual(rows.includes("payments"), true);
  assert.equal(airbnbAccountRows(false).includes("payments"), false);
  assert.equal(airbnbAccountRows(false).includes("sign-out"), false);
  const blob = JSON.stringify(airbnbCopy("en")) + JSON.stringify(airbnbCopy("fr"));
  assert.doesNotMatch(blob, /subscribe|upgrade|pay now|free forever/i);
  assert.match(blob, /Receipts only/);
  assert.match(airbnbCopy("fr").findNear, /garderie/);
});

test("the new shell does not call Google or change payment flags", () => {
  const ui = src("src/lib/airbnb-ui.ts") + src("src/components/airbnb-screens.tsx");
  assert.doesNotMatch(ui, /maps\.googleapis|places\.google|FEATURE_TAP_TO_PAY|FEATURE_PROVIDER_SUBSCRIPTIONS/);
  assert.match(src("src/components/app-tab-bar.tsx"), /marker="bookings"/);
  assert.match(src("src/components/app-tab-bar.tsx"), /!airbnb/);
});

test("phone home shows every childcare category as an icon row", () => {
  const ui = src("src/components/airbnb-screens.tsx");
  const css = src("src/styles.css");
  for (const id of ["all", "child_care_centre", "family_home", "group_home", "nursery_preschool", "school_age", "before_after", "open"]) {
    assert.match(ui, new RegExp(`id: "${id}"`));
  }
  assert.match(ui, /data-ke="airbnb-care-cats"/);
  assert.match(ui, /airbnb-care-\$\{cat\.id\}/);
  assert.match(css, /ke-cat-bob/);
  assert.match(css, /ke-cat-draw/);
  assert.match(css, /\.ke-home \[data-ke="msv2-categories"\]/);
  assert.match(css, /:has\(\.ke-home\) \[data-ke="phone-care-tabs"\]/);
  assert.match(src("src/components/shell.tsx"), /data-ke="phone-care-tabs"/);
});
