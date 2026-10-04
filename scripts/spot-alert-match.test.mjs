import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  planOpenSpotAlerts,
  spotAgeFits,
  spotAreaFits,
  spotStartFits,
} from "../src/lib/spot-alert-match.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-10-03T18:00:00.000Z");

function spot(over = {}) {
  return {
    listingId: "dc-1",
    city: "Montréal",
    lat: 45.5017,
    lng: -73.5673,
    agesKnown: true,
    ageMinMonths: 0,
    ageMaxMonths: 36,
    spotsInfant: 0,
    spotsToddler: 1,
    spotsPreschool: 0,
    ...over,
  };
}

function watch(over = {}) {
  return {
    id: "ss-1",
    parentId: "parent-1",
    ageBand: "toddler",
    childAgeMonths: 18,
    city: "Montreal",
    lat: 45.51,
    lng: -73.57,
    radiusKm: 8,
    startDate: "2026-10-20",
    digest: false,
    ...over,
  };
}

test("a posted spot matches age, area, and start date", () => {
  const row = spot();
  const fit = watch();
  assert.equal(spotAgeFits(fit, row), true);
  assert.equal(spotAgeFits(watch({ childAgeMonths: 48, ageBand: "preschool" }), row), false);
  assert.equal(spotAgeFits(watch({ childAgeMonths: 18 }), spot({ agesKnown: false })), false);
  assert.equal(spotAreaFits(fit, row), true);
  assert.equal(spotAreaFits(watch({ lat: null, lng: null, radiusKm: null }), spot({ lat: null, lng: null })), true);
  assert.equal(spotAreaFits(watch({ lat: null, lng: null, city: "Ottawa", radiusKm: null }), spot({ lat: null, lng: null })), false);
  assert.equal(spotAreaFits(watch({ lat: 49.9, lng: -97.1, radiusKm: 5 }), row), false);
  assert.equal(spotStartFits("2026-10-20", now), true);
  assert.equal(spotStartFits("2027-06-01", now), false);
  assert.equal(spotStartFits(null, now), true);
  assert.equal(spotStartFits("soon", now), false);
});

test("caps are one listing per parent and three a day, with a digest channel", () => {
  const spots = [1, 2, 3, 4].map((n) => spot({ listingId: `dc-${n}`, lat: 45.5 + n * 0.01 }));
  const watches = [
    watch({ id: "near", digest: false }),
    watch({ id: "again", parentId: "parent-1", digest: true }),
  ];
  const plan = planOpenSpotAlerts({
    spots,
    watches,
    prior: [{ parentId: "parent-1", listingId: "dc-1", day: "2026-10-01" }],
    now,
    sendEnabled: false,
  });
  assert.equal(plan.send, false);
  assert.deepEqual(
    plan.matches.map((row) => row.listingId),
    ["dc-2", "dc-3", "dc-4"],
  );
  assert.equal(plan.matches.every((row) => row.channel === "now"), true);
  assert.ok(plan.held.some((row) => row.listingId === "dc-1" && row.reason === "listing"));

  const digest = planOpenSpotAlerts({
    spots: spots.slice(0, 3),
    watches: [watch({ digest: true, childAgeMonths: 18 })],
    prior: [],
    now,
    sendEnabled: true,
  });
  assert.equal(digest.send, true);
  assert.equal(digest.matches.length, 3);
  assert.equal(digest.matches.every((row) => row.channel === "digest"), true);

  const fourth = planOpenSpotAlerts({
    spots,
    watches: [watch()],
    prior: [],
    now,
    sendEnabled: true,
  });
  assert.equal(fourth.matches.length, 3);
  assert.ok(fourth.held.some((row) => row.reason === "daily"));
});

test("open-spot sending stays behind the flag", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_OPEN_SPOT_ALERTS, false);
  const alerts = readFileSync(join(root, "src/lib/server/search-alerts.ts"), "utf8");
  assert.match(alerts, /eventsForOpenSpotMail\(events, spotMail\)/);
  assert.match(alerts, /planOpenSpotAlerts/);
  assert.match(alerts, /if \(!spotMail && row\.kind === "vacancy_reconfirmed"\) continue/);
  assert.match(alerts, /openSpotMailListingIds/);
  const flags = readFileSync(join(root, "src/lib/flags.ts"), "utf8");
  assert.match(flags, /FEATURE_OPEN_SPOT_ALERTS: false/);
});
