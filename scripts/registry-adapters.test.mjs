import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  loadManitobaRegistryIndex,
  lookupManitobaLicense,
  lookupRegistry,
  registryLookupIsLive,
} from "../src/lib/server/registry-adapters.ts";
import { JURISDICTIONS } from "../src/lib/province-registry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const FIXTURES = [
  { id: "mb-1001", licenseNumber: "MB-1001", name: "Test Elm Centre", city: "Winnipeg" },
  { id: "mb-2344", licenseNumber: "MB-2344", name: "Little Teaching Lodge", city: "Brandon" },
];

test("Manitoba local adapter matches bundled licences and stays honest on misses", () => {
  const index = loadManitobaRegistryIndex(FIXTURES);
  const hit = lookupRegistry("MB", "MB-1001", index);
  assert.equal(hit.ok, true);
  assert.equal(hit.reason, "local_catalog");
  assert.equal(hit.status, "adapter_ready");
  assert.equal(hit.match?.name, "Test Elm Centre");
  assert.equal(hit.match?.source, "local_catalog");
  assert.equal(registryLookupIsLive(hit), true);
  assert.match(hit.notes, /Not a live scrape/);

  const alt = lookupRegistry("mb", "1001", index);
  assert.equal(alt.ok, true);
  assert.equal(alt.match?.id, "mb-1001");

  const miss = lookupRegistry("MB", "MB-999999", index);
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, "not_in_snapshot");
  assert.equal(miss.status, "adapter_ready");
  assert.equal(registryLookupIsLive(miss), false);

  const blank = lookupRegistry("MB", "  ");
  assert.equal(blank.ok, false);
  assert.equal(blank.reason, "missing_number");
});

test("committed Manitoba index is a real local path for a known licence", () => {
  const row = lookupManitobaLicense("MB-1001");
  assert.ok(row, "MB-1001 should exist in the bundled snapshot");
  assert.equal(row.licenseNumber.toUpperCase().startsWith("MB-"), true);
  const live = lookupRegistry("MB", "MB-1001");
  assert.equal(registryLookupIsLive(live), true);
  assert.equal(live.match?.province, "MB");
});

test("non-Manitoba adapters stay stubs and never return a live match", () => {
  for (const j of JURISDICTIONS) {
    if (j.code === "MB") {
      assert.equal(j.adapterStatus, "adapter_ready");
      continue;
    }
    assert.equal(j.adapterStatus, "stub", j.code);
    const result = lookupRegistry(j.code, "FAKE-LICENCE-1");
    assert.equal(result.ok, false, j.code);
    assert.equal(result.reason, "stub", j.code);
    assert.equal(registryLookupIsLive(result), false, j.code);
    assert.equal(result.match, undefined, j.code);
  }
  const unknown = lookupRegistry("XX", "1");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, "stub");
});

test("adapters never scrape and UI copy does not claim a government sync", () => {
  const adapters = src("src/lib/server/registry-adapters.ts");
  assert.doesNotMatch(adapters, /cheerio|puppeteer|playwright\.chromium|fetch\(j\.registryUrl/);
  const ui = src("src/components/admin-trust.tsx");
  assert.match(ui, /does not pretend a scrape ran/);
  assert.doesNotMatch(ui, /Sync now/);
  const sql = src("migrations/0034_mb_registry_local.sql");
  assert.match(sql, /adapter_status = 'adapter_ready'/);
  assert.match(sql, /Not a live scrape/);
});
