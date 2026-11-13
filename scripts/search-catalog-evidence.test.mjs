import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { mergeSearchEvidence, searchEvidence, withSearchRows } from "../src/lib/search-evidence.ts";
import { haversineKm } from "../src/lib/geo.ts";

let sequence = 0;
const HOME = { lat: 49.5, lng: -117.28 };
function primary(rows, observedAt = 100) {
  return { rows, evidence: searchEvidence({ status: "complete", source: "primary", retryable: false, observedAt }) };
}
function row(id, extra = {}) {
  return { id, slug: id, name: id, lat: HOME.lat, lng: HOME.lng, city: "Nelson", province: "BC", ...extra };
}

/** Run the actual module with all SQL, disk, and dynamic source boundaries mocked. */
async function moduleUnderTest(file, overrides = {}) {
  const clock = { now: 100 };
  const deps = {
    dbSource: "neon", getSql: async () => ({ query: async () => [] }),
    catalogSourceFromEnv: () => "neon", neonCatalogMinCount: () => 1,
    preferNeonCatalog: ({ publicCount }) => publicCount > 0,
    CITY_SEARCH_KEY_EXPR: "city", cityDirectoryMatchSql: () => "city", citySearchKeyEnabled: () => false,
    PUBLIC_LISTING_SQL: "public", SUPPRESSED_CATALOG_SQL: "suppressed",
    LISTING_DISTANCE_KM_SQL: "distance", LISTING_WITHIN_RADIUS_SQL: "radius", LISTING_WITHIN_RADIUS_B_SQL: "radius_b",
    splitPhotoList: () => [], normalizeListingSlug: (v) => v, correctCentreNameTypos: (v) => v,
    listingVisibilityOf: (v) => v.visibility || "public", agesKnownFromConfirmedFlag: () => true,
    normalizeLicenseStatus: () => "active", normalizeMatchState: () => "matched", listingCultureFrom: () => ({}),
    foundingBadgeEnabled: () => false, foundingMemberVisible: () => false,
    isPublicListing: (v) => v.visibility !== "hidden" && !v.isTest,
    clampRadiusKm: (v) => v, normalizeCityKey: (v) => v.trim().toLowerCase(),
    bboxFromRadius: () => ({ minLat: 49, maxLat: 50, minLng: -118, maxLng: -117 }),
    distanceKm: () => 1, inBbox: () => true,
    loadRawCentresFromDisk: async () => [row("snapshot")], hydrateRaw: async (v) => v,
    loadJsonCatalogFromDisk: async () => [row("snapshot")], rememberSlugAliases: (rows) => new Map(rows.map((v) => [v.slug, v])),
    filterSuppressedCatalogRows: (rows, keys) => keys ? rows.filter((v) => !keys.ids.has(v.id)) : rows,
    __catalogNeon: {
      queryNeonCatalogAllResult: async () => null,
      loadSuppressedCatalogKeys: async () => ({ ids: new Set(), slugs: new Set() }),
      neonCatalogByIdsResult: async () => null,
    },
    centresInLiveSearch: (rows) => rows,
    verifiedSearchPoint: (v) => ({ eligible: true, lat: v.lat, lng: v.lng }),
    provinceSearchTokens: (v) => [v], haversineKm: () => 1,
    CATALOG_SELECT: "id,slug", catalogRowToListing: (v) => v,
    searchEvidence: (input = {}) => searchEvidence({ ...input, observedAt: input.observedAt ?? clock.now }), mergeSearchEvidence, withSearchRows,
    Date: class extends Date { static now() { return clock.now; } },
    ...overrides,
  };
  // Catalog-neon defines its own production mapper; don't shadow that binding.
  if (file.endsWith("catalog-neon.ts")) delete deps.catalogRowToListing;
  if (file.endsWith("catalog-neon.ts")) delete deps.CATALOG_SELECT;
  deps.__testDb = { dbSource: deps.dbSource };
  deps.__testSource = { catalogSourceFromEnv: deps.catalogSourceFromEnv };
  const key = `__catalogEvidenceTest${sequence++}`;
  globalThis[key] = deps;
  const source = stripTypeScriptTypes(readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8"));
  const body = source.replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*from\s*["'][^"']+["'];\s*/gm, "")
    .replace(/import\("\.\/server\/catalog-neon"\)/g, "Promise.resolve(__catalogNeon)")
    .replace(/import\("\.\/db"\)/g, "Promise.resolve(__testDb)")
    .replace(/import\("\.\/catalog-source"\)/g, "Promise.resolve(__testSource)");
  const prefix = `const {${Object.keys(deps).join(",")}} = globalThis[${JSON.stringify(key)}];\nconst setTimeout = () => 0;\n`;
  try {
    return { module: await import(`data:text/javascript;base64,${Buffer.from(prefix + body).toString("base64")}`), clock };
  } finally { delete globalThis[key]; }
}

test("Neon captures raw nearby cap before hydration, preserves cached age, and refresh bypasses it", async () => {
  let calls = 0;
  let rows = Array.from({ length: 400 }, (_, i) => row(`raw-${i}`, { slug: i === 0 ? "kept" : "" }));
  const sql = { query: async (text) => text.includes("pg_extension") ? [{ ok: true }] : (calls++, rows) };
  const { module, clock } = await moduleUnderTest("server/catalog-neon.ts", { getSql: async () => sql });
  const first = await module.queryNeonNearbyResult(HOME, 25);
  assert.equal(first.rows.length, 1);
  assert.equal(first.evidence.status, "partial");
  assert.equal(first.evidence.totalKind, "at-least");
  assert.deepEqual(first.evidence.reasons, ["candidate-limit"]);
  assert.equal(first.evidence.observedAt, 100);
  rows = [row("new")]; clock.now = 200;
  const cached = await module.queryNeonNearbyResult(HOME, 25);
  assert.deepEqual(cached, first);
  assert.equal(calls, 1);
  const fresh = await module.queryNeonNearbyResult(HOME, 25, undefined, 400, { refresh: true });
  assert.equal(fresh.rows[0].id, "new");
  assert.equal(fresh.evidence.status, "complete");
  assert.equal(fresh.evidence.observedAt, 200);
  assert.equal(calls, 2);
  assert.deepEqual(await module.queryNeonNearby(HOME, 25), fresh.rows);
});

test("Neon city and dual caps survive filtering, and empty primary remains complete", async () => {
  let rows = Array.from({ length: 2500 }, (_, i) => row(`raw-${i}`, { slug: i === 0 ? "kept" : "" }));
  const sql = { query: async (text) => text.includes("pg_extension") ? [{ ok: true }] : rows };
  const { module } = await moduleUnderTest("server/catalog-neon.ts", { getSql: async () => sql });
  const hub = await module.queryNeonCityHubListingsResult("BC", ["nelson"]);
  assert.equal(hub.rows.length, 1);
  assert.equal(hub.evidence.status, "partial");
  rows = rows.slice(0, 400);
  const dual = await module.queryNeonNearbyDualResult(HOME, HOME, 25);
  assert.equal(dual.rows.length, 1);
  assert.equal(dual.evidence.status, "partial");
  rows = [];
  const empty = await module.queryNeonNearbyResult(HOME, 25, undefined, 400, { refresh: true });
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.evidence.status, "complete");
  assert.equal(empty.evidence.totalKind, "exact");
});

test("close nearby origins have separate cache entries and distinct radius-boundary listings", async () => {
  const shifted = { lat: HOME.lat + 0.0004, lng: HOME.lng + 0.0004 };
  assert.equal(HOME.lat.toFixed(3), shifted.lat.toFixed(3));
  assert.equal(HOME.lng.toFixed(3), shifted.lng.toFixed(3));
  const degrees = (km) => km / 6371 * 180 / Math.PI;
  const north = row("north-boundary", { lat: HOME.lat + degrees(25.015) });
  const south = row("south-boundary", { lat: HOME.lat - degrees(24.985) });
  assert.ok(haversineKm(HOME, north) > 25 && haversineKm(shifted, north) < 25);
  assert.ok(haversineKm(HOME, south) < 25 && haversineKm(shifted, south) > 25);
  let reads = 0;
  const sql = { query: async (text, params) => {
    if (text.includes("pg_extension")) return [{ ok: true }];
    reads++;
    return [north, south].filter((point) => haversineKm({ lat: params[1], lng: params[0] }, point) <= params[2] / 1000);
  } };
  const { module } = await moduleUnderTest("server/catalog-neon.ts", { getSql: async () => sql });
  assert.deepEqual((await module.queryNeonNearbyResult(HOME, 25)).rows.map((v) => v.id), ["south-boundary"]);
  assert.deepEqual((await module.queryNeonNearbyResult(shifted, 25)).rows.map((v) => v.id), ["north-boundary"]);
  assert.equal(reads, 2);
  assert.deepEqual((await module.queryNeonNearbyResult(HOME, 25)).rows.map((v) => v.id), ["south-boundary"]);
  assert.equal(reads, 2);
});

test("close dual-anchor coordinates have separate cache entries for either anchor", async () => {
  const shifted = { lat: HOME.lat + 0.0004, lng: HOME.lng + 0.0004 };
  const north = row("north-boundary", { lat: HOME.lat + (25.015 / 6371 * 180 / Math.PI) });
  const south = row("south-boundary", { lat: HOME.lat - (24.985 / 6371 * 180 / Math.PI) });
  let reads = 0;
  const sql = { query: async (text, params) => {
    if (text.includes("pg_extension")) return [{ ok: true }];
    reads++;
    return [north, south].filter((point) =>
      haversineKm({ lat: params[1], lng: params[0] }, point) <= params[2] / 1000 &&
      haversineKm({ lat: params[4], lng: params[3] }, point) <= params[2] / 1000);
  } };
  const { module } = await moduleUnderTest("server/catalog-neon.ts", { getSql: async () => sql });
  assert.deepEqual((await module.queryNeonNearbyDualResult(HOME, HOME, 25)).rows.map((v) => v.id), ["south-boundary"]);
  assert.deepEqual((await module.queryNeonNearbyDualResult(shifted, HOME, 25)).rows, []);
  assert.deepEqual((await module.queryNeonNearbyDualResult(HOME, shifted, 25)).rows, []);
  assert.deepEqual((await module.queryNeonNearbyDualResult(shifted, shifted, 25)).rows.map((v) => v.id), ["north-boundary"]);
  assert.equal(reads, 4);
  assert.deepEqual((await module.queryNeonNearbyDualResult(HOME, HOME, 25)).rows.map((v) => v.id), ["south-boundary"]);
  assert.equal(reads, 4);
});

test("uncapped name and full-table reads retain primary evidence and refresh their caches", async () => {
  let rows = [row("old")];
  const sql = { query: async (text) => text.includes("count(*)") ? [{ n: 10000 }] : rows };
  const { module, clock } = await moduleUnderTest("server/catalog-neon.ts", { getSql: async () => sql });
  const name = await module.queryNeonPublicNameIndexResult();
  const all = await module.queryNeonCatalogAllResult();
  assert.equal(name.evidence.status, "complete");
  assert.equal(all.evidence.status, "complete");
  rows = [row("new")]; clock.now = 500;
  assert.equal((await module.queryNeonPublicNameIndexResult()).evidence.observedAt, 100);
  assert.equal((await module.queryNeonCatalogAllResult()).rows[0].id, "old");
  assert.equal((await module.queryNeonPublicNameIndexResult({ refresh: true })).rows[0].id, "new");
  assert.equal((await module.queryNeonCatalogAllResult({ refresh: true })).evidence.observedAt, 500);
  assert.equal((await module.queryNeonListingsByIdsResult(["new"])).evidence.totalKind, "exact");
  assert.deepEqual(await module.loadNeonCatalogIfPreferred(), (await module.queryNeonCatalogAllResult()).rows);
  assert.deepEqual(await module.queryNeonPublicNameIndex(), (await module.queryNeonPublicNameIndexResult()).rows);
  assert.deepEqual(await module.queryNeonListingsByIds(["new"]), (await module.queryNeonListingsByIdsResult(["new"])).rows);
});

test("failed Neon reads return unavailable instead of caching fabricated empty batches", async () => {
  const { module } = await moduleUnderTest("server/catalog-neon.ts", { getSql: async () => { throw new Error("unavailable"); } });
  assert.equal(await module.queryNeonNearbyResult(HOME, 25), null);
  assert.equal(await module.queryNeonCityHubListingsResult("BC", ["nelson"]), null);
  assert.equal(await module.queryNeonPublicNameIndexResult(), null);
});

test("catalog snapshot fallback has an available count, stable source age and local retry policy", async () => {
  const { module, clock } = await moduleUnderTest("catalog.ts", { dbSource: "pglite", catalogSourceFromEnv: () => "auto" });
  const first = await module.getPublicCatalogResult();
  assert.equal(first.evidence.status, "unverified");
  assert.equal(first.evidence.source, "snapshot");
  assert.equal(first.evidence.totalKind, "available");
  assert.equal(first.evidence.retryable, false);
  clock.now = 1000;
  assert.equal((await module.getPublicCatalogResult()).evidence.observedAt, 100);
  assert.equal((await module.catalogNearFromJsonResult(HOME, 25)).evidence.observedAt, 100);
  assert.equal((await module.catalogNamedCityFromJsonResult("Nelson", "BC")).evidence.observedAt, 100);
  assert.deepEqual(await module.getPublicCatalog(), first.rows);
});

test("catalog refresh can recover from snapshot to primary without calling production", async () => {
  let primaryBatch = null;
  const { module } = await moduleUnderTest("catalog.ts", {
    __catalogNeon: {
      queryNeonCatalogAllResult: async () => primaryBatch,
      loadSuppressedCatalogKeys: async () => ({ ids: new Set(), slugs: new Set() }),
    },
  });
  assert.equal((await module.getPublicCatalogResult()).evidence.retryable, true);
  primaryBatch = primary([row("primary")], 700);
  const recovered = await module.getPublicCatalogResult({ refresh: true });
  assert.deepEqual(recovered, primaryBatch);
});

test("pinned IDs mixing primary and bundle retain row order and uncertain suppression evidence", async () => {
  const { module } = await moduleUnderTest("catalog.ts", {
    loadJsonCatalogFromDisk: async () => [row("bundle")],
    __catalogNeon: {
      neonCatalogByIdsResult: async () => primary([row("primary")]),
      loadSuppressedCatalogKeys: async () => null,
    },
  });
  const result = await module.catalogByIdsGetResult(["bundle", "primary"]);
  assert.deepEqual(result.rows.map((v) => v.id), ["primary", "bundle"]);
  assert.equal(result.evidence.status, "unverified");
  assert.equal(result.evidence.source, "mixed");
  assert.equal(result.evidence.totalKind, "available");
  assert.ok(result.evidence.reasons.includes("supplement-unavailable"));
});

test("approved supplement cap is captured before seen-ID filtering; failures keep primary rows", async () => {
  const existing = row("existing");
  let fail = false;
  const { module } = await moduleUnderTest("server/approved-search.ts", {
    getSql: async () => ({ query: async () => { if (fail) throw new Error("unavailable"); return Array.from({ length: 400 }, () => existing); } }),
  });
  const input = { origin: HOME, radiusKm: 25, lock: { city: "Nelson", province: "BC", metroKeys: ["nelson"] } };
  const result = await module.mergeApprovedCityListingsResult(primary([existing]), input);
  assert.deepEqual(result.rows, [existing]);
  assert.equal(result.evidence.status, "partial");
  assert.ok(result.evidence.reasons.includes("candidate-limit"));
  fail = true;
  const failed = await module.mergeApprovedCityListingsResult(primary([existing]), input);
  assert.deepEqual(failed.rows, [existing]);
  assert.equal(failed.evidence.totalKind, "at-least");
  assert.equal(failed.evidence.retryable, true);
  assert.ok(failed.evidence.reasons.includes("supplement-unavailable"));
});
