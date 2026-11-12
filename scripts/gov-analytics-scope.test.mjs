import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildGovDashboard, parseGovScope } from "../src/lib/gov/aggregate.ts";
import { bundleForScope } from "../src/lib/gov/bundle.ts";
import { dashboardCsv } from "../src/lib/gov/csv.ts";
import { PUBLIC_LISTING_SQL } from "../src/lib/listing-visibility.ts";

const actor = { orgName: "QA province", demo: true, readOnly: true };
const city = (name, n, province = "MB") => ({
  province, city: name, centres: n, licensed: n, capacity: n * 20, capacityKnown: n,
  vacancyReporters: n, vacancyFresh30: n, openSpots: n, cwelccKnown: n,
  feesConfirmed: n, feesUncited: 0, french: n, english: n, inclusion: n, lat: 49.9, lng: -97.1,
});

function bundle() {
  return {
    cities: [city("Winnipeg", 8), city("Brandon", 12)],
    fees: [
      { province: "MB", city: "Wpg", kind: "confirmed", bucket: "under_400", n: 8 },
      { province: "MB", city: "Brandon", kind: "confirmed", bucket: "400_799", n: 12 },
    ],
    waitlist: [{ province: "MB", age: "infant", start: "", n: 10 }],
    trends: [
      { province: "MB", city: "Wpg", month: "2026-10", listings: 8, vacancyUpdates: 6, jobs: 5 },
      { province: "MB", city: "Brandon", month: "2026-10", listings: 12, vacancyUpdates: 10, jobs: 8 },
    ],
    fill: [
      { province: "MB", city: "Wpg", n: 8, avgDays: 4 },
      { province: "MB", city: "Brandon", n: 12, avgDays: 14 },
    ],
    jobCounts: [{ province: "MB", city: "Wpg", n: 6 }, { province: "MB", city: "Brandon", n: 9 }],
    generatedAt: "2026-11-12T00:00:00.000Z",
  };
}

function dashboard(rawBundle, input, locale = "en") {
  const scope = parseGovScope(input);
  return buildGovDashboard(bundleForScope(rawBundle, scope), scope, locale, actor);
}

test("Winnipeg analytics use only Winnipeg records, including the Wpg alias", () => {
  const data = dashboard(bundle(), { province: "MB", city: "Wpg" });
  assert.equal(data.placeLabel, "Winnipeg, Manitoba");
  assert.equal(data.kpis.directoryCentres, 8);
  assert.equal(data.kpis.jobPosts, 6);
  assert.equal(data.kpis.avgFillDays, 4);
  assert.deepEqual(data.fees, [{ bucket: "under_400", kind: "confirmed", centres: 8, suppressed: false }]);
  assert.deepEqual(data.trends, [{ month: "2026-10", listings: 8, vacancyUpdates: 6, jobs: 5 }]);
  assert.deepEqual(data.regions, [{ label: "Winnipeg", centres: 8, suppressed: false }]);
  assert.deepEqual(data.cities.map((row) => row.label), ["Winnipeg"]);
  assert.ok(data.selectors.cities.includes("Brandon"), "other safe city choices remain available");
  assert.equal(data.waitlist[0].n, 10);
  assert.match(data.waitlistContext, /all of Manitoba.*not attributed to a city/);
  const csv = dashboardCsv(data);
  assert.match(csv, /waitlist,infant,10,Context for all of Manitoba/);
  assert.doesNotMatch(csv, /400_799/);
});

test("province totals still combine both cities and weight accepted offers", () => {
  const data = dashboard(bundle(), { province: "MB" });
  assert.equal(data.kpis.directoryCentres, 20);
  assert.equal(data.kpis.jobPosts, 15);
  assert.equal(data.kpis.avgFillDays, 10);
  assert.equal(data.trends[0].listings, 20);
  assert.equal(data.fees.length, 2);
  assert.equal(data.waitlistContext, undefined);
});

test("a region includes its cities but does not reuse a provincial census population", () => {
  const raw = bundle();
  const data = dashboard(raw, { province: "MB", region: "Winnipeg" });
  assert.equal(data.kpis.directoryCentres, 8);
  assert.equal(data.kpis.jobPosts, 6);
  assert.deepEqual(data.regions, [{ label: "Winnipeg", centres: 8, suppressed: false }]);
  assert.deepEqual(data.desert, { population: null, perSpace: null, source: null });
});

test("French city and region accents match the same attributed analytics", () => {
  const raw = bundle();
  raw.cities = [city("Montréal", 4, "QC"), city("Montreal", 4, "QC"), city("Québec", 12, "QC")];
  for (const key of ["fees", "trends", "fill", "jobCounts"]) {
    raw[key] = raw[key].map((row, index) => ({ ...row, province: "QC", city: index ? "Québec" : "Montreal" }));
  }
  raw.waitlist = [{ province: "QC", age: "infant", start: "", n: 10 }];
  const data = dashboard(raw, { province: "QC", city: "Montréal", region: "Montréal" }, "fr");
  assert.equal(data.kpis.directoryCentres, 8);
  assert.equal(data.kpis.jobPosts, 6);
  assert.equal(data.kpis.avgFillDays, 4);
  assert.equal(data.trends[0].listings, 8);
  assert.equal(data.cities.length, 1, "accent aliases are one city before suppression");
  assert.deepEqual(data.regions, [{ label: "Montreal", centres: 8, suppressed: false }]);
  assert.match(data.waitlistContext, /Québec au complet.*pas attribuées à une ville/);
});

test("an unmatched city never falls back to province analytics", () => {
  const data = dashboard(bundle(), { province: "MB", city: "No match" });
  assert.equal(data.kpis.directoryCentres, 0);
  assert.equal(data.kpis.jobPosts, 0);
  assert.equal(data.kpis.avgFillDays, null);
  assert.deepEqual(data.fees, []);
  assert.deepEqual(data.trends, []);
  assert.deepEqual(data.regions, []);
  assert.match(data.waitlistContext, /not attributed to a city/);
});

test("city filters preserve small-group and complementary suppression", () => {
  const raw = bundle();
  raw.fees = [
    { province: "MB", city: "Wpg", kind: "confirmed", bucket: "under_400", n: 2 },
    { province: "MB", city: "Winnipeg", kind: "confirmed", bucket: "400_799", n: 6 },
    { province: "MB", city: "Brandon", kind: "confirmed", bucket: "1200_plus", n: 12 },
  ];
  raw.trends[0] = { ...raw.trends[0], listings: 2, vacancyUpdates: 3, jobs: 4 };
  raw.fill[0] = { ...raw.fill[0], n: 3 };
  raw.jobCounts[0].n = 3;
  raw.waitlist = [
    { province: "MB", age: "infant", start: "", n: 2 },
    { province: "MB", age: "toddler", start: "", n: 8 },
  ];
  const data = dashboard(raw, { province: "MB", city: "Winnipeg" });
  assert.equal(data.kpis.jobPosts, null);
  assert.equal(data.kpis.avgFillDays, null);
  assert.equal(data.fees.length, 2);
  assert.ok(data.fees.every((row) => row.suppressed && row.centres == null));
  assert.ok(data.waitlist.every((row) => row.suppressed && row.n == null));
  assert.deepEqual(data.trends, [{ month: "2026-10", listings: null, vacancyUpdates: null, jobs: null }]);
  const csv = dashboardCsv(data);
  assert.doesNotMatch(csv, /\nfee,|\nwaitlist,/);
  assert.match(csv, /trend_listings,2026-10,,/);
});

test("the actual city and fee SQL count unmapped public listings without moving map points", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`create table daycares (
      id text, slug text, name text, province text, city text, license_number text, license_status text,
      licensed_capacity int, last_vacancy_updated_at timestamp, spots_updated_at timestamp,
      confirmed_open_spots int, spots_infant int, spots_toddler int, spots_preschool int,
      fee_program text, fact_source text, infant_monthly numeric, toddler_monthly numeric, preschool_monthly numeric,
      languages text, staff_languages jsonb, amenities text, programs jsonb, lat float8, lng float8,
      merged_into text, import_fault text, listing_active int, is_test int, is_demo int,
      visibility text, address text, claim_status text
    );
    insert into daycares (id, slug, name, province, city, license_number, licensed_capacity, fact_source, toddler_monthly, lat, lng)
    select 'fixture-' || n, 'public-centre-' || n, 'Public centre ' || n, 'MB',
      case when n <= 4 then 'Wpg' when n <= 8 then 'Winnipeg' else 'Brandon' end,
      'licence-' || n, 20, 'Synthetic cited source', 350,
      case when n <= 2 then 49.9 when n = 5 then 50.2 else 0 end,
      case when n <= 2 then -97.1 when n = 5 then -97.4 else 0 end
    from generate_series(1, 16) n;
    insert into daycares (id, slug, name, province, city, is_test, toddler_monthly, lat, lng)
    values ('hidden-fixture', 'hidden-fixture', 'Hidden fixture', 'MB', 'Winnipeg', 1, 350, 50, -97);`);
    // Execute the production query text, not a second implementation of its filters.
    const source = readFileSync(new URL("../src/lib/server/gov-data.server.ts", import.meta.url), "utf8");
    const licensed = source.slice(source.indexOf("const LICENSED_SQL =")).split("`")[1];
    const query = (name, next) => source.slice(source.indexOf(`const ${name} =`), source.indexOf(`const ${next} =`)).split("`")[1]
      .replaceAll("${PUBLIC_LISTING_SQL}", PUBLIC_LISTING_SQL).replaceAll("${LICENSED_SQL}", licensed);
    const cities = (await db.query(query("cityRows", "feeRows"))).rows.map((row) => ({ ...row, lat: row.lat ?? 0, lng: row.lng ?? 0 }));
    const fees = (await db.query(query("feeRows", "waitRows"))).rows;
    const raw = { cities, fees, waitlist: [], trends: [], fill: [], jobCounts: [], generatedAt: "2026-11-12T00:00:00.000Z" };
    const data = dashboard(raw, { province: "MB", city: "Winnipeg" });
    assert.equal(data.kpis.directoryCentres, 8);
    assert.equal(data.kpis.feesConfirmedCentres, 8);
    assert.equal(data.fees[0].centres, 8);
    assert.equal(data.map.length, 1);
    assert.ok(Math.abs(data.map[0].lat - 50) < 0.000001, "only the three mapped listings weight the merged alias point");
    assert.ok(Math.abs(data.map[0].lng + 97.2) < 0.000001);
    const unmapped = dashboard(raw, { province: "MB", city: "Brandon" });
    assert.equal(unmapped.kpis.directoryCentres, 8);
    assert.equal(unmapped.fees[0].centres, 8);
    assert.deepEqual(unmapped.map, []);
  } finally {
    await db.close();
  }
});
