import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  adminLicenceFact,
  centresInLiveSearch,
  planApproval,
  approvalHealthSummary,
  publicApprovalEligible,
} from "../src/lib/approve-live.ts";
import { matchesDaycareName } from "../src/lib/explore-search.ts";
import { geocode } from "../src/lib/geo.ts";
import { provinceSearchTokens } from "../src/lib/location-lock.ts";
import { alignSearchOrigin } from "../src/lib/search-query.ts";
import { flushSearchMemo, rememberSearch } from "../src/lib/server/search-memo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const edmonton = geocode("Edmonton, AB");
const winnipeg = geocode("Winnipeg");
const halifax = geocode("Halifax");
const vancouver = geocode("Vancouver");
const calgary = geocode("Calgary");

const kidsWorld = {
  id: "ab-kh2t",
  daycareId: "ab-kh2t",
  slug: "kids-world-daycare-kh2t",
  name: "Kids World Daycare",
  city: "Edmonton",
  province: "AB",
  lat: winnipeg.lat,
  lng: winnipeg.lng,
  licenseNumber: "70051797",
  licenseStatus: "unverified",
  screeningOnFile: false,
  staffScreeningAttested: true,
  claimStatus: "waiting",
  claimedAt: null,
  listingActive: true,
  ratingX10: 0,
  reviewCount: 0,
};

function approvedKidsWorld(overrides = {}) {
  const plan = planApproval(kidsWorld, [
    { id: "cl-joan", status: "waiting", createdAt: "2026-09-13T00:00:00.000Z" },
  ]);
  assert.equal(plan.ok, true);
  return {
    ...plan.next,
    slug: "kids-world-daycare-kh2t",
    name: "Kids World Daycare",
    city: "Edmonton",
    province: "Alberta",
    lat: winnipeg.lat,
    lng: winnipeg.lng,
    ...overrides,
  };
}

test("Edmonton Live search keeps Kids World when Admin and the public page mark it Live", () => {
  assert.ok(edmonton);
  assert.ok(winnipeg);
  const centre = approvedKidsWorld();
  assert.equal(publicApprovalEligible(centre), true, "public Approved strip requires this centre");
  assert.match(
    adminLicenceFact({
      licenseNumber: centre.licenseNumber,
      licenseStatus: "unverified",
      daycareId: centre.id,
    }).status,
    /70051797/,
  );

  const waiting = {
    ...kidsWorld,
    claimStatus: "waiting",
    claimedAt: "2026-09-01",
    licenseStatus: "matched",
    licenseVerificationSource: "admin",
  };
  const unlicensed = approvedKidsWorld({
    id: "ab-unlicensed",
    daycareId: "ab-unlicensed",
    slug: "unlicensed-centre",
    name: "Unlicensed Centre",
    licenseStatus: "unverified",
    licenseVerificationSource: null,
    licenseNumber: "",
  });
  const hits = centresInLiveSearch([centre, waiting, unlicensed], {
    origin: edmonton,
    radiusKm: 25,
    label: "Edmonton, AB",
  });
  assert.deepEqual(
    hits.map((row) => row.slug),
    ["kids-world-daycare-kh2t"],
    "Admin/public Live centre missing from Live search",
  );
});

test("Live search is the same rule in every city", () => {
  assert.ok(halifax);
  assert.ok(vancouver);
  assert.ok(calgary);
  const kids = approvedKidsWorld();
  const harbour = {
    id: "ns-harbour",
    slug: "harbour-kids",
    name: "Harbour Kids",
    city: "Halifax",
    province: "Nova Scotia",
    lat: halifax.lat,
    lng: halifax.lng,
    licenseNumber: "NS44821",
    licenseStatus: "matched",
    licenseVerificationSource: "provider",
    claimStatus: "approved",
    claimedAt: "2026-09-01",
    listingActive: true,
    screeningOnFile: true,
    ratingX10: 0,
    reviewCount: 0,
  };
  const coast = {
    id: "bc-coast",
    slug: "coast-kids",
    name: "Coast Kids",
    city: "Vancouver",
    province: "British Columbia",
    lat: vancouver.lat,
    lng: vancouver.lng,
    licenseNumber: "BC88001",
    licenseStatus: "matched",
    licenseVerificationSource: "admin",
    claimStatus: "live",
    claimedAt: "2026-09-01",
    listingActive: true,
    screeningOnFile: true,
  };

  assert.deepEqual(
    centresInLiveSearch([harbour, kids], { origin: halifax, radiusKm: 25, label: "Halifax, NS" }).map((row) => row.slug),
    ["harbour-kids"],
  );
  assert.deepEqual(
    centresInLiveSearch([coast, kids], { origin: vancouver, radiusKm: 25, label: "Vancouver, BC" }).map((row) => row.slug),
    ["coast-kids"],
  );
  assert.equal(
    centresInLiveSearch([kids], { origin: calgary, radiusKm: 25, label: "Calgary, AB" }).length,
    0,
    "an Edmonton centre stays out of a Calgary radius",
  );
});

test("province names match codes, and the radius uses the city pin", () => {
  assert.ok(provinceSearchTokens("AB").includes("ALBERTA"));
  assert.ok(provinceSearchTokens("Alberta").includes("AB"));
  assert.ok(provinceSearchTokens("BC").includes("BRITISH COLUMBIA"));
  assert.ok(provinceSearchTokens("Québec").includes("QC"));
  assert.ok(provinceSearchTokens("Nova Scotia").includes("NS"));

  const snappedPin = approvedKidsWorld({ lat: 0, lng: 0, province: "AB" });
  assert.equal(
    centresInLiveSearch([snappedPin], { origin: edmonton, radiusKm: 25, label: "Edmonton, AB" }).length,
    1,
    "a missing street pin still uses the Edmonton city point",
  );

  const nearby = { lat: edmonton.lat + 0.08, lng: edmonton.lng };
  assert.equal(
    centresInLiveSearch([snappedPin], { origin: nearby, radiusKm: 25, label: "Edmonton, AB" }).length,
    1,
  );
  const far = { lat: edmonton.lat + 0.9, lng: edmonton.lng };
  assert.equal(
    centresInLiveSearch([snappedPin], { origin: far, radiusKm: 25, label: "Edmonton, AB" }).length,
    0,
    "radius still excludes a city pin outside the circle",
  );

  const inactive = approvedKidsWorld({ id: "ab-off", daycareId: "ab-off", slug: "paused", listingActive: false });
  assert.equal(centresInLiveSearch([inactive], { origin: edmonton, radiusKm: 25, label: "Edmonton, AB" }).length, 0);

  const noScreening = approvedKidsWorld({
    id: "ab-noscreen",
    daycareId: "ab-noscreen",
    slug: "licence-only",
    screeningOnFile: false,
    staffScreeningAttested: false,
  });
  assert.equal(publicApprovalEligible(noScreening), false);
  assert.equal(
    centresInLiveSearch([noScreening], { origin: edmonton, radiusKm: 25, label: "Edmonton, AB" }).length,
    1,
    "Live search follows licence evidence, not the public screening strip",
  );
});

test("approved Peninsula Oak stays out of Vancouver Live search; Kids World stays in Edmonton", () => {
  assert.ok(vancouver);
  assert.ok(edmonton);
  const oak = approvedKidsWorld({
    id: "bc-3572",
    daycareId: "bc-3572",
    slug: "peninsula-montessori-academy-oak-3572",
    name: "Peninsula Montessori Academy Oak",
    city: "Vancouver",
    province: "BC",
    lat: vancouver.lat,
    lng: vancouver.lng,
    licenseNumber: "3572",
    isTest: 1,
    visibility: "admin_only",
  });
  const coast = {
    id: "bc-coast",
    slug: "coast-kids",
    name: "Coast Kids",
    city: "Vancouver",
    province: "British Columbia",
    lat: vancouver.lat,
    lng: vancouver.lng,
    licenseNumber: "BC88001",
    licenseStatus: "matched",
    licenseVerificationSource: "admin",
    claimStatus: "live",
    claimedAt: "2026-09-01",
    listingActive: true,
    screeningOnFile: true,
  };
  const kids = approvedKidsWorld();
  assert.equal(publicApprovalEligible(oak), true, "Approve still succeeds for the fixture desk");
  assert.deepEqual(
    centresInLiveSearch([oak, coast], { origin: vancouver, radiusKm: 25, label: "Vancouver, BC" }).map((row) => row.slug),
    ["coast-kids"],
  );
  assert.deepEqual(
    centresInLiveSearch([kids, oak], { origin: edmonton, radiusKm: 25, label: "Edmonton, AB" }).map((row) => row.slug),
    ["kids-world-daycare-kh2t"],
  );
  const flaggedBySlug = approvedKidsWorld({
    id: "bc-3572",
    daycareId: "bc-3572",
    slug: "peninsula-montessori-academy-oak-3572",
    name: "Peninsula Montessori Academy Oak",
    city: "Vancouver",
    province: "BC",
    lat: vancouver.lat,
    lng: vancouver.lng,
    licenseNumber: "3572",
    isTest: 0,
    visibility: "public",
  });
  assert.equal(
    centresInLiveSearch([flaggedBySlug], { origin: vancouver, radiusKm: 25, label: "Vancouver, BC" }).length,
    0,
  );
  const planned = planApproval(
    {
      ...flaggedBySlug,
      claimStatus: "waiting",
      claimedAt: null,
      licenseStatus: "unverified",
      licenseVerificationSource: null,
      staffScreeningAttested: true,
      screeningOnFile: false,
    },
    [{ id: "cl-oak", status: "waiting", createdAt: "2026-09-01T00:00:00.000Z" }],
  );
  assert.equal(planned.ok, true, "Approve still marks the fixture Live for the daycare desk");
  assert.match(approvalHealthSummary(planned.health).body, /stays out of public Live search/);
  assert.doesNotMatch(approvalHealthSummary(planned.health).body, /Parents can find this centre/);
});

test("name filter still narrows Live results", () => {
  const kids = approvedKidsWorld();
  const river = approvedKidsWorld({
    id: "ab-river",
    daycareId: "ab-river",
    slug: "river-valley-early-learning",
    name: "River Valley Early Learning",
    licenseNumber: "70059999",
    lat: edmonton.lat,
    lng: edmonton.lng,
    province: "AB",
  });
  const hits = centresInLiveSearch([kids, river], {
    origin: edmonton,
    radiusKm: 25,
    label: "Edmonton, AB",
  });
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.filter((row) => matchesDaycareName(row, "Kids World")).map((row) => row.slug),
    ["kids-world-daycare-kh2t"],
  );
  assert.deepEqual(
    hits.filter((row) => matchesDaycareName(row, "River")).map((row) => row.slug),
    ["river-valley-early-learning"],
  );
  assert.equal(hits.filter((row) => matchesDaycareName(row, "No Such Centre")).length, 0);
});

test("a named city replaces a pin outside that city", () => {
  const snapped = alignSearchOrigin({
    lat: winnipeg.lat,
    lng: winnipeg.lng,
    radiusKm: 25,
    q: "Edmonton, AB",
    label: "Winnipeg, MB",
  });
  assert.equal(snapped.label, "Edmonton, AB");
  assert.ok(Math.abs(snapped.lat - edmonton.lat) < 0.01);

  const street = alignSearchOrigin({
    lat: edmonton.lat + 0.02,
    lng: edmonton.lng,
    radiusKm: 25,
    q: "Edmonton",
  });
  assert.ok(Math.abs(street.lat - (edmonton.lat + 0.02)) < 0.001);

  const halifaxPin = alignSearchOrigin({
    lat: winnipeg.lat,
    lng: winnipeg.lng,
    radiusKm: 15,
    q: "Halifax",
  });
  assert.equal(halifaxPin.label, "Halifax, NS");
});

test("approve flushes the search memo so the next Live search sees the centre", async () => {
  flushSearchMemo();
  await rememberSearch("live-city", async () => [{ id: "stale-without-kh2t" }]);
  flushSearchMemo();
  let builds = 0;
  const rows = await rememberSearch("live-city", async () => {
    builds += 1;
    return [{ id: "kids-world-daycare-kh2t" }];
  });
  const cached = await rememberSearch("live-city", async () => {
    builds += 1;
    return [];
  });
  assert.equal(builds, 1);
  assert.equal(cached[0].id, "kids-world-daycare-kh2t");
  assert.equal(rows[0].id, "kids-world-daycare-kh2t");

  const search = src("src/lib/server/daycares.ts");
  const geo = src("src/lib/server/listing-geo-sql.ts");
  assert.match(search, /alignSearchOrigin/);
  assert.match(search, /searchIncludingLive/);
  assert.match(search, /liveCardsForSearch/);
  assert.match(search, /mergeApprovedCityListings/);
  assert.match(geo, /st_makepoint\(lng, lat\)/);
  assert.match(geo, /LISTING_WITHIN_RADIUS_SQL/);
  assert.match(src("src/lib/server/catalog-neon.ts"), /LISTING_WITHIN_RADIUS_SQL/);
  assert.match(src("src/lib/server/search-alerts.ts"), /LISTING_WITHIN_RADIUS_SQL/);
  assert.match(src("src/lib/server/approved-search.ts"), /provinceSearchTokens/);
  assert.match(src("src/lib/server/approved-search.ts"), /listing_active = 1/);
  assert.match(src("src/lib/server/approve-centre.ts"), /flushSearchMemo\(\)/);
  assert.match(src("src/lib/search-cache.ts"), /live3/);
  const migration = src("migrations/0054_live_search_pin.sql");
  assert.match(migration, /st_makepoint\(lng, lat\)/);
  assert.match(migration, /daycares_approved_city_idx/);
  assert.doesNotMatch(migration, /kids-world-daycare-kh2t/);
});
