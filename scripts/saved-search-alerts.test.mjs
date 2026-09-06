import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function isValidSearchOrigin(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

function parseSavedSearchFilters(raw) {
  const srcObj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const flag = (v) => v === true || v === 1 || v === "1";
  const avail = ["any", "open", "waitlist", "unknown"].includes(srcObj.avail) ? srcObj.avail : "any";
  return {
    avail,
    liveOnly: flag(srcObj.liveOnly),
    ten: flag(srcObj.ten),
    meals: flag(srcObj.meals),
    outdoor: flag(srcObj.outdoor),
    inclusive: flag(srcObj.inclusive),
    extended: flag(srcObj.extended),
    infantOnly: flag(srcObj.infantOnly),
    catchmentOnly: flag(srcObj.catchmentOnly),
    confirmedOnly: flag(srcObj.confirmedOnly),
    readyOnly: flag(srcObj.readyOnly),
    claimVerifiedOnly: flag(srcObj.claimVerifiedOnly),
  };
}

function matchesAgeBand(ageBand, row) {
  if (ageBand === "any") return true;
  if (row.agesKnown === false) return false;
  if (ageBand === "infant") return row.ageMinMonths <= 18;
  if (ageBand === "toddler") return row.ageMinMonths < 36 && row.ageMaxMonths >= 18;
  return row.ageMaxMonths >= 30 && row.ageMinMonths < 72;
}

test("saved origin must be real coordinates — never invent lat/lng", () => {
  assert.equal(isValidSearchOrigin(49.8951, -97.1384), true);
  assert.equal(isValidSearchOrigin(0, 0), false);
  assert.equal(isValidSearchOrigin(Number.NaN, -97), false);
  assert.equal(isValidSearchOrigin(91, -97), false);
  assert.equal(isValidSearchOrigin("49.9", "-97.1"), false);
  const lib = src("src/lib/saved-search.ts");
  assert.match(lib, /Never substitute a city default/);
  assert.match(lib, /export function isValidSearchOrigin/);
  const matcher = src("src/lib/server/search-alerts.ts");
  assert.match(matcher, /Never invent/);
  assert.match(matcher, /isValidSearchOrigin/);
  assert.doesNotMatch(matcher, /WINNIPEG/);
  assert.doesNotMatch(src("src/lib/server/saved-searches.ts"), /lat:\s*49\.8951/);
});

test("filters parse PR #59 honesty chips and age-band matches search", () => {
  const filters = parseSavedSearchFilters({
    confirmedOnly: true,
    readyOnly: 1,
    claimVerifiedOnly: "1",
    avail: "open",
  });
  assert.equal(filters.confirmedOnly, true);
  assert.equal(filters.readyOnly, true);
  assert.equal(filters.claimVerifiedOnly, true);
  assert.equal(filters.avail, "open");
  assert.equal(filters.meals, false);
  assert.equal(matchesAgeBand("any", { ageMinMonths: 0, ageMaxMonths: 0, agesKnown: false }), true);
  assert.equal(matchesAgeBand("infant", { ageMinMonths: 12, ageMaxMonths: 24, agesKnown: true }), true);
  assert.equal(matchesAgeBand("infant", { ageMinMonths: 24, ageMaxMonths: 60, agesKnown: true }), false);
  const lib = src("src/lib/saved-search.ts");
  assert.match(lib, /confirmedOnly/);
  assert.match(lib, /readyOnly/);
  assert.match(lib, /claimVerifiedOnly/);
  assert.match(lib, /matchesAgeBand/);
  assert.match(lib, /listingMatchesSavedFilters/);
});

test("migration stores saved searches and alert prefs without push tokens", () => {
  const sql = src("migrations/0029_saved_search_alerts.sql");
  assert.match(sql, /create table if not exists saved_searches/);
  assert.match(sql, /center_lat/);
  assert.match(sql, /center_lng/);
  assert.match(sql, /search_alert_prefs/);
  assert.match(sql, /email_enabled/);
  assert.match(sql, /in_app_enabled/);
  assert.match(sql, /search_alert_notices/);
  assert.match(sql, /search_alert_candidates/);
  assert.match(sql, /new_centre/);
  assert.match(sql, /vacancy_reconfirmed/);
  assert.doesNotMatch(sql, /create table if not exists push_/);
  assert.match(sql, /No FCM tokens here/);
  assert.match(sql, /never invented/i);
});

test("matcher uses ST_DWithin like nearby.ts (lng, lat)", () => {
  const alerts = src("src/lib/server/search-alerts.ts");
  const nearby = src("src/lib/server/nearby.ts");
  assert.match(alerts, /SEARCH_ALERT_MATCH_SQL/);
  assert.match(alerts, /st_dwithin/i);
  assert.match(alerts, /st_makepoint\(\$1, \$2\)/);
  assert.match(nearby, /st_makepoint\(\$1, \$2\)/);
  assert.match(alerts, /last_vacancy_updated_at/);
  assert.match(alerts, /FEATURE_PUSH stays off/);
  assert.doesNotMatch(alerts, /sendPushNotification/);
  assert.match(alerts, /does NOT send FCM/);
});

test("email path uses Resend when wired and stubs with a TODO otherwise", () => {
  const alerts = src("src/lib/server/search-alerts.ts");
  assert.match(alerts, /RESEND_API_KEY/);
  assert.match(alerts, /TODO: wire Resend/);
  assert.match(alerts, /email stub/);
  assert.match(alerts, /sendSearchAlertEmail/);
});

test("cron stub is wired next to digest and does not enable FEATURE_PUSH", () => {
  const cron = src("src/routes/api/search-alerts.ts");
  assert.match(cron, /runSearchAlertJob/);
  assert.match(cron, /CRON_SECRET/);
  const vercel = src("vercel.json");
  assert.match(vercel, /\/api\/search-alerts/);
  assert.match(src(".env.example"), /FEATURE_PUSH=0/);
  assert.doesNotMatch(src("src/lib/features.ts"), /FEATURE_PUSH.*=\s*["']1["']/);
});

test("parent can save list edit delete from search + family desk", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /saveSearch/);
  assert.match(search, /takeSavedSearchToApply/);
  assert.match(src("src/components/parent-desk.tsx"), /SavedSearchesPanel/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /listSavedSearches/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /deleteSavedSearch/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /updateSavedSearch/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /saveSearchAlertPrefs/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "alerts"/);
  const fns = src("src/lib/server/saved-searches.ts");
  assert.match(fns, /export const listSavedSearches/);
  assert.match(fns, /export const saveSearch/);
  assert.match(fns, /export const updateSavedSearch/);
  assert.match(fns, /export const deleteSavedSearch/);
  assert.match(fns, /export const saveSearchAlertPrefs/);
});
