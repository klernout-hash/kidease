import assert from "node:assert/strict";
import test from "node:test";
import { buildGovDashboard } from "../src/lib/gov/aggregate.ts";

function city(partial) {
  return {
    province: "MB",
    city: "Winnipeg",
    centres: 8,
    licensed: 8,
    capacity: 40,
    capacityKnown: 8,
    vacancyReporters: 0,
    vacancyFresh30: 0,
    openSpots: 2,
    cwelccKnown: 8,
    feesConfirmed: 8,
    feesUncited: 0,
    french: 0,
    english: 8,
    inclusion: 0,
    lat: 49.9,
    lng: -97.1,
    ...partial,
  };
}

const actor = { orgName: "Manitoba", demo: true, readOnly: true };
const empty = { fees: [], waitlist: [], trends: [], fill: { n: 0, avgDays: null }, jobs: 0, generatedAt: "2026-11-07T00:00:00.000Z" };

test("a small spot count is not shown as zero on the map", () => {
  const data = buildGovDashboard(
    { cities: [city({ capacity: 3, openSpots: 2 })], ...empty },
    { province: "MB", region: "ALL", city: "ALL" },
    "en",
    actor,
  );
  assert.equal(data.map.length, 1);
  assert.equal(data.map[0].centres, 8);
  assert.equal(data.map[0].openSpots, null);
  assert.equal(data.map[0].capacity, null);
});

test("fee and program splits cannot be worked out from a small remainder", () => {
  const data = buildGovDashboard(
    {
      cities: [city({ centres: 20, licensed: 20, capacity: 200, openSpots: 10, cwelccKnown: 18, feesConfirmed: 16, feesUncited: 3, english: 20 })],
      ...empty,
      jobs: 8,
    },
    { province: "MB", region: "ALL", city: "ALL" },
    "en",
    actor,
  );
  assert.equal(data.kpis.directoryCentres, 20);
  assert.equal(data.kpis.licensedCentres, 20);
  assert.equal(data.kpis.feesConfirmedCentres, null);
  assert.equal(data.kpis.feesUncitedCentres, null);
  assert.equal(data.kpis.feesNoneCentres, null);
  assert.equal(data.kpis.cwelccKnown, null);
  assert.equal(data.kpis.cwelccUnknown, null);
});
