import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { searchEvidence, withSearchRows } from "../src/lib/search-evidence.ts";

let sequence = 0;
function batch(rows, overrides = {}) {
  return { rows, evidence: searchEvidence({ status: "complete", source: "primary", retryable: false, observedAt: 1234, ...overrides }) };
}
function snapshot(rows, retryable = false) {
  return batch(rows, { status: "unverified", source: "snapshot", retryable });
}

/** Execute the real wrapper bodies with every database/catalogue boundary stubbed. */
async function wrappers(file, overrides = {}) {
  const calls = [];
  const deps = {
    dbSource: "neon", getSql: async () => ({}), catalogSourceFromEnv: () => "auto",
    catalogNearFromJsonResult: async (...args) => { calls.push(["json", ...args]); return snapshot([{ id: "snapshot", lat: 1, lng: 1 }], true); },
    queryNeonNearbyResult: async (...args) => { calls.push(["nearby", ...args]); return batch([{ id: "primary", lat: 1, lng: 1 }]); },
    queryNeonNearbyDualResult: async (...args) => { calls.push(["dual", ...args]); return batch([{ id: "primary", lat: 1, lng: 1 }]); },
    queryNeonCityHubListingsResult: async (...args) => { calls.push(["hub", ...args]); return batch([{ id: "primary", city: "Wanted" }]); },
    isNeonCatalogPreferred: async () => true,
    isPublicListing: (row) => !row.hidden,
    upsertDaycare: async () => { calls.push(["seed"]); },
    clampRadiusKm: (value) => value,
    distanceKm: (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng),
    commuteMidpoint: (a, b) => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }),
    commuteQueryRadiusKm: () => 50,
    isAlongCommute: (_a, _b, row) => row.lng === 1,
    getPublicCatalog: async () => [],
    getPublicCatalogResult: async (...args) => { calls.push(["catalog", ...args]); return snapshot([{ id: "snapshot", city: "Wanted" }]); },
    cityHubNeedleKeys: () => ["wanted"], hubDef: (slug) => slug === "missing" ? null : { province: "MB" },
    listingBelongsToHub: (row) => row.city === "Wanted",
    directoryCountsFromGroups: () => ({}), directoryCountsFromRows: () => ({}),
    queryNeonDirectoryGroups: async () => [], CITY_HUB_MIN_LISTINGS: 1,
    searchEvidence, withSearchRows,
    ...overrides,
  };
  const key = `__searchWrapperTest${sequence++}`;
  globalThis[key] = deps;
  const source = stripTypeScriptTypes(readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8"));
  const body = source.replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*from\s*["'][^"']+["'];\s*/gm, "");
  const prefix = `const {${Object.keys(deps).join(",")}} = globalThis[${JSON.stringify(key)}];\nconst setTimeout = () => 0;\n`;
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(prefix + body).toString("base64")}`);
    return { module, calls };
  } finally {
    delete globalThis[key];
  }
}

const HOME = { lat: 1, lng: 1 };
const WORK = { lat: 2, lng: 1 };

test("nearby preserves capped primary evidence through public filtering and forwards refresh", async () => {
  const primary = batch([{ id: "hidden", hidden: true }, { id: "kept" }], { status: "partial", reasons: ["candidate-limit"] });
  const { module, calls } = await wrappers("nearby", {
    queryNeonNearbyResult: async (...args) => { calls.push(["nearby", ...args]); return primary; },
  });
  const result = await module.nearbyListingsResult(HOME, 25, 400, { refresh: true });
  assert.deepEqual(result.rows, [{ id: "kept" }]);
  assert.deepEqual(result.evidence, primary.evidence);
  assert.deepEqual(calls[0].at(-1), { refresh: true });
  assert.equal(result.evidence.observedAt, 1234);
  assert.deepEqual(await module.nearbyListings(HOME, 25), [{ id: "kept" }]);
});

test("authoritative empty nearby results never fall back to snapshot", async () => {
  const empty = batch([]);
  const { module, calls } = await wrappers("nearby", {
    queryNeonNearbyResult: async () => empty,
    isNeonCatalogPreferred: async (...args) => { calls.push(["preferred", ...args]); return true; },
  });
  assert.deepEqual(await module.nearbyListingsResult(HOME, 25, 400, { refresh: true }), empty);
  assert.equal(calls.some((call) => call[0] === "json"), false);
  assert.deepEqual(calls[0].at(-1), { refresh: true });
});

test("unavailable primary nearby returns an unverified retryable snapshot, never a lower bound", async () => {
  const { module } = await wrappers("nearby", { queryNeonNearbyResult: async () => null });
  const result = await module.nearbyListingsResult(HOME, 25);
  assert.equal(result.evidence.status, "unverified");
  assert.equal(result.evidence.source, "snapshot");
  assert.equal(result.evidence.totalKind, "available");
  assert.equal(result.evidence.retryable, true);
  assert.equal(result.evidence.observedAt, 1234);
  assert.ok(result.evidence.reasons.includes("source-fallback"));
  assert.ok(result.evidence.reasons.includes("source-unavailable"));
});

test("local JSON nearby keeps snapshot provenance without promising a useful retry", async () => {
  const { module, calls } = await wrappers("nearby", {
    dbSource: "pglite", catalogNearFromJsonResult: async () => snapshot([{ id: "local" }]),
  });
  const result = await module.nearbyListingsResult(HOME, 25);
  assert.equal(result.evidence.totalKind, "available");
  assert.equal(result.evidence.retryable, false);
  assert.equal(calls.length, 0);
});

test("dual nearby preserves coverage through the intersection and its array wrapper", async () => {
  const resultBatch = batch([{ id: "dual" }], { status: "partial", reasons: ["candidate-limit"] });
  const { module, calls } = await wrappers("nearby", {
    queryNeonNearbyDualResult: async (...args) => { calls.push(["dual", ...args]); return resultBatch; },
  });
  const result = await module.nearbyListingsDualResult(HOME, WORK, 25, { refresh: true });
  assert.deepEqual(result, resultBatch);
  assert.deepEqual(calls[0].at(-1), { refresh: true });
  assert.deepEqual(await module.nearbyListingsDual(HOME, WORK, 25), resultBatch.rows);
});

test("corridor filtering cannot upgrade a capped nearby result to complete", async () => {
  const resultBatch = batch([{ id: "along", lng: 1 }, { id: "off", lng: 20 }], { status: "partial", reasons: ["candidate-limit"] });
  const { module, calls } = await wrappers("nearby", {
    queryNeonNearbyResult: async (...args) => { calls.push(["nearby", ...args]); return resultBatch; },
  });
  const result = await module.nearbyListingsAlongResult(HOME, WORK, 25, { refresh: true });
  assert.deepEqual(result.rows, [{ id: "along", lng: 1 }]);
  assert.deepEqual(result.evidence, resultBatch.evidence);
  assert.equal(calls[0][4], 800);
  assert.deepEqual(calls[0].at(-1), { refresh: true });
});

test("city hub keeps cap evidence before city filtering and forwards refresh", async () => {
  const resultBatch = batch([{ id: "right", city: "Wanted" }, { id: "wrong", city: "Other" }], { status: "partial", reasons: ["candidate-limit"] });
  const { module, calls } = await wrappers("city-directory", {
    queryNeonCityHubListingsResult: async (...args) => { calls.push(["hub", ...args]); return resultBatch; },
  });
  const result = await module.listingsForCityHubResult("wanted", { refresh: true });
  assert.deepEqual(result.rows, [{ id: "right", city: "Wanted" }]);
  assert.deepEqual(result.evidence, resultBatch.evidence);
  assert.deepEqual(calls[0].at(-1), { refresh: true });
  assert.deepEqual(await module.listingsForCityHub("wanted"), result.rows);
});

test("city hub snapshot fallback preserves its source age and records primary failure", async () => {
  const { module } = await wrappers("city-directory", { queryNeonCityHubListingsResult: async () => null });
  const result = await module.listingsForCityHubResult("wanted", { refresh: true });
  assert.equal(result.evidence.status, "unverified");
  assert.equal(result.evidence.totalKind, "available");
  assert.equal(result.evidence.observedAt, 1234);
  assert.equal(result.evidence.retryable, true);
  assert.ok(result.evidence.reasons.includes("source-unavailable"));
});
