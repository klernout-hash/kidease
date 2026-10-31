import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { geocode } from "../src/lib/geo.ts";
import { photonToPlace } from "../src/lib/photon.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { areaWaitlistAlertsEnabled } from "../src/lib/features.ts";
import { areaWaitlistCopy } from "../src/lib/area-waitlist-copy.ts";
import {
  areaPlaceQuery,
  areaSpotKey,
  areaWaitlistLetter,
  areaWaitlistSms,
  areaWaitlistSmsAllowed,
  normalizeCanadianPostal,
  planAreaWaitlistHits,
  vacancyIsNewer,
} from "../src/lib/area-waitlist.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const now = new Date("2026-10-30T18:00:00Z");

function watch(over = {}) {
  return {
    id: "aw1",
    userId: "parent-1",
    lat: 49.8951,
    lng: -97.1384,
    radiusKm: 10,
    ageBand: "infant",
    startDate: "2026-11-15",
    checkedAt: "2026-10-01T00:00:00Z",
    label: "Winnipeg, MB",
    ...over,
  };
}

function spot(over = {}) {
  return {
    listingId: "dc1",
    slug: "sunny-side",
    name: "Sunny Side",
    city: "Winnipeg",
    lat: 49.9,
    lng: -97.14,
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 18,
    spotsInfant: 1,
    spotsToddler: 0,
    spotsPreschool: 0,
    vacancyAt: "2026-10-30T15:00:00Z",
    ...over,
  };
}

test("postal codes and cities geocode in Canada without Google", () => {
  assert.equal(normalizeCanadianPostal("r3c1a1"), "R3C 1A1");
  assert.equal(normalizeCanadianPostal("not a code"), null);
  assert.equal(areaPlaceQuery("  Winnipeg  MB  "), "Winnipeg MB");
  const city = geocode("Winnipeg");
  assert.equal(city?.label.includes("Winnipeg"), true);
  const postal = geocode("R3C 1A1");
  assert.equal(postal?.label.includes("Winnipeg"), true);
  const hit = photonToPlace(
    { geometry: { coordinates: [-97.14, 49.89] }, properties: { name: "Winnipeg", state: "Manitoba", countrycode: "CA" } },
    "Winnipeg",
  );
  assert.equal(hit?.label.includes("Winnipeg"), true);
  assert.equal(
    photonToPlace(
      { geometry: { coordinates: [-74, 40.7] }, properties: { name: "New York", countrycode: "US" } },
      "New York",
    ),
    null,
  );
});

test("a posted spot matches distance, age, and start date once", () => {
  const hits = planAreaWaitlistHits({ watches: [watch()], spots: [spot()], prior: [], now });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].daycareId, "dc1");
  assert.equal(hits[0].spotKey, areaSpotKey(spot().vacancyAt, { infant: 1, toddler: 0, preschool: 0 }, now));
  assert.equal(planAreaWaitlistHits({ watches: [watch({ ageBand: "preschool" })], spots: [spot()], prior: [], now }).length, 0);
  assert.equal(planAreaWaitlistHits({ watches: [watch({ radiusKm: 1, lat: 43.65, lng: -79.38, label: "Toronto, ON" })], spots: [spot()], prior: [], now }).length, 0);
  assert.equal(planAreaWaitlistHits({ watches: [watch({ startDate: "2027-08-01" })], spots: [spot()], prior: [], now }).length, 0);
  assert.equal(vacancyIsNewer("2026-10-01T00:00:00Z", "2026-10-30T00:00:00Z"), false);
  assert.equal(planAreaWaitlistHits({ watches: [watch({ checkedAt: "2026-10-30T16:00:00Z" })], spots: [spot()], prior: [], now }).length, 0);
  const key = hits[0].spotKey;
  assert.equal(
    planAreaWaitlistHits({
      watches: [watch()],
      spots: [spot()],
      prior: [{ userId: "parent-1", daycareId: "dc1", spotKey: key, day: "2026-10-30" }],
      now,
    }).length,
    0,
  );
});

test("area email stays off and the draft is English and French", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_AREA_WAITLIST_ALERTS, false);
  assert.equal(areaWaitlistAlertsEnabled({}), false);
  assert.equal(areaWaitlistAlertsEnabled({ FEATURE_AREA_WAITLIST_ALERTS: "1" }), true);
  const shared = {
    centre: "Sunny Side",
    city: "Winnipeg",
    place: "Winnipeg, MB",
    km: 1.2,
    ageBand: "infant",
    url: "https://www.kidease.ca/daycare/sunny-side",
    manageUrl: "https://www.kidease.ca/parent?tab=waitlists",
  };
  const en = areaWaitlistLetter({ locale: "en", ...shared });
  const fr = areaWaitlistLetter({ locale: "fr", ...shared });
  assert.match(en.subject, /spot may be open near Winnipeg/);
  assert.match(en.text, /not a reserved spot/);
  assert.match(en.text, /Sunny Side/);
  assert.match(fr.subject, /place pourrait être libre/);
  assert.match(fr.text, /pas une place réservée/);
  assert.match(fr.text, /Groupe d'âge : Poupon/);
  assert.doesNotMatch(en.text + fr.text, /—|maps\.google|@/);
  assert.equal(fr.html.includes("<Sunny"), false);
  const sms = areaWaitlistSms({ centre: "Sunny Side", city: "Winnipeg" });
  assert.match(sms, /STOP/);
  assert.match(sms, /Sunny Side/);
});

test("area waitlist texts are free and still need the SMS flag and CASL consent", () => {
  assert.equal(areaWaitlistSmsAllowed({ smsOn: true, caslConsent: true }), true);
  assert.equal(areaWaitlistSmsAllowed({ smsOn: false, caslConsent: true }), false);
  assert.equal(areaWaitlistSmsAllowed({ smsOn: true, caslConsent: false }), false);
  assert.equal(areaWaitlistSmsAllowed({ smsOn: false, caslConsent: false }), false);
  const job = src("src/lib/server/area-waitlist-job.ts");
  assert.match(job, /areaWaitlistSmsAllowed/);
  assert.doesNotMatch(job, /parentAlertsEntitled|plus_plan/);
  const saved = src("src/lib/server/search-alerts.ts");
  assert.match(saved, /parentAlertsEntitled/);
  assert.match(saved, /plus_plan=alerts/);
});

test("guest waitlist copy tells parents how to join, in English and French", () => {
  const en = areaWaitlistCopy("en");
  const fr = areaWaitlistCopy("fr");
  assert.match(en.guestHow, /Open any daycare and tap Join the waitlist/);
  assert.match(en.guestHow, /area waitlist/);
  assert.match(fr.guestHow, /Joindre la liste d'attente/);
  assert.match(fr.guestHow, /liste de secteur/);
  assert.equal(en.signIn, "Sign in");
  assert.equal(en.createAccount, "Create an account");
  for (const value of Object.values(fr)) {
    assert.equal(typeof value, "string");
    assert.doesNotMatch(value, /—/);
    assert.doesNotMatch(value, /[^\s]: /);
  }
});

test("join buttons, role hide, and the alert job stay on the existing rails", () => {
  const card = src("src/components/daycare-card.tsx");
  const home = src("src/components/parent-home.tsx");
  const form = src("src/components/join-waitlist.tsx");
  const page = src("src/routes/waitlist.tsx");
  const server = src("src/lib/server/area-waitlist-job.ts");
  const actions = src("src/lib/server/area-waitlist.ts");
  const job = src("src/lib/server/search-alerts.ts");
  const migration = src("migrations/0107_area_waitlist.sql");
  assert.match(card, /hash="join-waitlist"/);
  assert.match(card, /showsParentBrowseActions/);
  assert.match(card, /data-ke="card-join-waitlist"/);
  assert.match(home, /hash="join-waitlist"/);
  assert.match(home, /AreaWaitlistForm/);
  assert.match(form, /#join-waitlist/);
  assert.match(page, /guestHow/);
  assert.match(page, /parentSignupSearch/);
  assert.match(server, /photon\.komoot\.io|photonSearchUrl/);
  assert.doesNotMatch(server, /maps\.googleapis|google\.com\/maps|nominatim/i);
  assert.doesNotMatch(server, /parentAlertsEntitled/);
  assert.match(server, /FEATURE_AREA_WAITLIST_ALERTS|areaWaitlistAlertsEnabled/);
  assert.match(server, /FEATURE_PUSH/);
  assert.doesNotMatch(server, /push\.server|alert-dispatch/);
  assert.match(server, /smsEnabled\(\)/);
  assert.match(server, /showsParentBrowseActions/);
  assert.match(actions, /joinAreaWaitlistForUser/);
  assert.doesNotMatch(actions, /transactional-mail|alert-dispatch|push\.server/);
  assert.match(job, /coalesce\(kind, 'search'\) = 'search'/);
  assert.match(job, /runAreaWaitlistAlerts/);
  assert.match(migration, /waitlist_area/);
  assert.match(migration, /area_waitlist_sends_once/);
  assert.match(src(".env.example"), /^FEATURE_AREA_WAITLIST_ALERTS=0$/m);
  assert.match(src("src/lib/server/family.ts"), /last_vacancy_updated_at/);
  assert.doesNotMatch(src("src/lib/server/family.ts"), /area-waitlist/);
  assert.doesNotMatch(src("src/lib/server/claims.ts"), /area-waitlist/);
  assert.doesNotMatch(src("src/lib/server/open-spots-checkin.ts"), /area-waitlist/);
});
