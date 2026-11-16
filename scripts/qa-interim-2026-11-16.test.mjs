import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appAvailabilitySentence } from "../src/lib/app-stores.ts";
import { claimListingScore } from "../src/lib/claim-search.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("a centre name search does not match unrelated cities", () => {
  const query = "KidEase Test Daycare";
  const unrelated = [
    { id: "mtl", name: "Garderie du Parc", city: "Montreal", province: "QC" },
    { id: "cor", name: "Cornwall Child Care", city: "Cornwall", province: "ON" },
    { id: "wpg", name: "River Heights Child Care", city: "Winnipeg", province: "MB" },
  ];
  for (const row of unrelated) assert.equal(claimListingScore(query, row), 0, row.city);
  assert.ok(
    claimListingScore(query, { id: "qa", name: "KidEase Test Daycare", city: "Winnipeg" }) >= 70,
  );
  assert.equal(claimListingScore("day", { id: "x", name: "Daycare Centre", city: "Montreal" }), 0);
  assert.ok(claimListingScore("Wheels", { id: "w", name: "L'il Wheels DayCare", city: "Winnipeg" }) >= 80);
});

test("store sentences follow the same live list as the tiles", () => {
  const en = appAvailabilitySentence("en");
  const fr = appAvailabilitySentence("fr");
  assert.match(en, /Available: Google Play, Amazon Appstore, Huawei AppGallery/);
  assert.match(en, /Not available yet: App Store, Galaxy Store, Microsoft Store/);
  assert.doesNotMatch(en, /not approved yet|Google Play are not/);
  assert.match(fr, /Offert : Google Play, Amazon Appstore, Huawei AppGallery/);
  assert.match(fr, /Pas encore offert : App Store/);
  const seo = src("src/lib/page-seo.ts");
  assert.match(seo, /appAvailabilitySentence/);
  assert.doesNotMatch(seo, /Google Play are not approved yet/);
});

test("government overview renders one map and does not flash an empty centre list", () => {
  const dash = src("src/components/gov/gov-dashboard.tsx");
  assert.equal(dash.match(/<GovMap /g)?.length, 1);
  assert.match(dash, /gov-centres-loading/);
  assert.match(dash, /gov-centres-empty/);
  assert.match(dash, /gov-centres-error/);
  const map = src("src/components/gov/gov-map.tsx");
  assert.match(map, /gov-map-loading/);
  assert.match(map, /gov-map-failed/);
  assert.match(map, /gov-map-empty/);
});

test("French sign-up links stay on French pages", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /localePath\("\/privacy", locale\)/);
  assert.match(login, /localePath\("\/terms", locale\)/);
  assert.match(login, /localePath\("\/cookies", locale\)/);
  assert.match(login, /hash="sms"/);
  const sms = src("src/components/parent-sms-fields.tsx");
  assert.match(sms, /to="\/fr\/terms"/);
  assert.match(sms, /hash="sms"/);
  assert.match(sms, /to="\/fr\/privacy"/);
});

test("an unverified listing does not claim a registry match", () => {
  const page = src("src/routes/daycare.$slug.tsx");
  assert.match(page, /licensed \? t\("licenceRecordLead"\) : t\("licenceRecordUnverified"\)/);
  const badge = src("src/components/listing-status-badge.tsx");
  assert.match(badge, /listingBadgeWaiting/);
  assert.doesNotMatch(badge, /listingStatusLabel/);
});
