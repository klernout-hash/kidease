import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  isManualStubAdapter,
  loadManitobaRegistryIndex,
  lookupManitobaLicense,
  lookupManualStubAdapter,
  lookupRegistry,
  MANUAL_STUB_ADAPTER_CODES,
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

test("ON AB BC SK QC stub adapters fail closed to manual review", () => {
  assert.deepEqual([...MANUAL_STUB_ADAPTER_CODES], ["ON", "AB", "BC", "SK", "QC"]);
  for (const code of MANUAL_STUB_ADAPTER_CODES) {
    const j = JURISDICTIONS.find((row) => row.code === code);
    assert.ok(j, code);
    assert.equal(j.adapterStatus, "manual", code);
    assert.equal(isManualStubAdapter(code), true);
    assert.match(j.adapterNotes, /Fail closed/);
    assert.match(j.adapterNotes, /Not a live registry match/);
    assert.doesNotMatch(j.adapterNotes, /TODO:/);

    const hit = lookupRegistry(code, "FAKE-LICENCE-1");
    assert.equal(hit.ok, false, code);
    assert.equal(hit.status, "manual", code);
    assert.equal(hit.reason, "manual", code);
    assert.equal(registryLookupIsLive(hit), false, code);
    assert.equal(hit.match, undefined, code);
    assert.ok(hit.registryUrl, code);

    const viaHelper = lookupManualStubAdapter(code, "FAKE-LICENCE-1");
    assert.equal(viaHelper.ok, false, code);
    assert.equal(viaHelper.reason, "manual", code);

    const blank = lookupRegistry(code, "  ");
    assert.equal(blank.ok, false, code);
    assert.equal(blank.reason, "missing_number", code);
    assert.match(blank.notes, /fails closed/i);
  }
});

test("non-Manitoba leftover adapters stay stubs and never return a live match", () => {
  for (const j of JURISDICTIONS) {
    if (j.code === "MB") {
      assert.equal(j.adapterStatus, "adapter_ready");
      continue;
    }
    if (isManualStubAdapter(j.code)) {
      assert.equal(j.adapterStatus, "manual", j.code);
      continue;
    }
    assert.equal(j.adapterStatus, "stub", j.code);
    assert.match(j.adapterNotes, /Fail closed/);
    assert.doesNotMatch(j.adapterNotes, /TODO:/);
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
  const stubs = src("migrations/0040_provincial_registry_stubs.sql");
  for (const code of ["ON", "AB", "BC", "SK", "QC"]) {
    assert.match(stubs, new RegExp(`where code = '${code}'`));
  }
  assert.match(stubs, /adapter_status = 'manual'/);
  assert.match(stubs, /Fail closed to operator manual review/);
  assert.match(stubs, /Manitoba stays adapter_ready/);
  assert.doesNotMatch(stubs, /TODO:/);
});
