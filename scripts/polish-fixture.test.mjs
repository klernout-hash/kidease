import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  assertLocalFixtureEnvironment,
  assertFixtureValidity,
  changedFixtureTables,
  exportFixtureSnapshot,
  fingerprintDatabase,
  fixtureValidityFromState,
  importFixtureSnapshot,
  isForbiddenFixturePath,
  privateAuthKey,
  sha256,
} from "./polish-fixture-lib.mjs";
import { normalizeFixtureState } from "./polish-fixture-prepare.mjs";

const safe = { POLISH_FIXTURE_DATABASE: "local-pglite", E2E_ROLE_FIXTURE: "1", SUBSCRIPTIONS_ENABLED: "0", SHOW_PAY_CTAS: "0" };

test("snapshot guard rejects a configured database, provider credentials, and changed flags", () => {
  assert.doesNotThrow(() => assertLocalFixtureEnvironment(safe));
  for (const env of [{ ...safe, DATABASE_URL: "configured" }, { ...safe, STRIPE_SECRET_KEY: "configured" }, { ...safe, BETTER_AUTH_SECRET: "configured" }, { ...safe, SUBSCRIPTIONS_ENABLED: "1" }, {}])
    assert.throws(() => assertLocalFixtureEnvironment(env));
});

test("a private auth key survives process reuse without appearing in proof output", () => {
  const dir = mkdtempSync(join(tmpdir(), "polish-fixture-key-"));
  try {
    const path = join(dir, "auth.key");
    const first = privateAuthKey(path);
    assert.equal(privateAuthKey(path), first);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.match(first, /^[a-f0-9]{64}$/);
  } finally { rmSync(dir, { recursive: true }); }
});

test("PGlite archive imports reproduce every original row, identities, order, and auth rows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "polish-fixture-db-"));
  const original = new PGlite();
  let before;
  let after;
  try {
    await original.exec('create table content(id text primary key, ordinal int, label text); create table "session"(id text, token text);');
    await original.query("insert into content values ('b',2,'Second'),('a',1,'First')");
    await original.query('insert into "session" values ($1,$2)', ["local-session", "private-local-token"]);
    const archive = join(dir, "canonical.tgz");
    const exported = await exportFixtureSnapshot(original, archive);
    assert.equal(exported.sha256, sha256(readFileSync(archive)));
    assert.equal(statSync(archive).mode & 0o777, 0o400);
    assert.equal(JSON.stringify(exported).includes("private-local-token"), false);
    before = await importFixtureSnapshot(archive, exported.sha256);
    after = await importFixtureSnapshot(archive, exported.sha256);
    assert.equal((await fingerprintDatabase(before)).sha256, exported.fingerprint.sha256);
    assert.equal((await fingerprintDatabase(after)).sha256, exported.fingerprint.sha256);
    assert.deepEqual((await before.query("select id,label from content order by ordinal")).rows, (await after.query("select id,label from content order by ordinal")).rows);
    await after.query("update content set label='Changed' where id='a'");
    const changes = changedFixtureTables(await fingerprintDatabase(before), await fingerprintDatabase(after));
    assert.deepEqual(changes.map((row) => row.name), ["content"]);
    assert.equal((await before.query("select label from content where id='a'")).rows[0].label, "First");
    await assert.rejects(importFixtureSnapshot(archive, "0".repeat(64)), /SHA256 mismatch/);
    writeFileSync(join(dir, "tampered.tgz"), "invalid archive");
    await assert.rejects(importFixtureSnapshot(join(dir, "tampered.tgz"), exported.sha256), /SHA256 mismatch/);
  } finally {
    await original.close();
    await before?.close();
    await after?.close();
    rmSync(dir, { recursive: true });
  }
});

test("role state normalization changes only local-storage origin, preserving private cookie bytes", () => {
  const state = { cookies: [{ name: "session", value: "synthetic-token", domain: "127.0.0.1" }], origins: [{ origin: "http://127.0.0.1:8091", localStorage: [{ name: "theme", value: "light" }] }] };
  const normalized = normalizeFixtureState(state, "http://127.0.0.1:8092");
  assert.equal(normalized.origins[0].origin, "http://127.0.0.1:8092");
  assert.deepEqual(normalized.cookies, state.cookies);
  assert.deepEqual(normalized.origins[0].localStorage, state.origins[0].localStorage);
  assert.equal(state.origins[0].origin, "http://127.0.0.1:8091");
});

test("fixture expiry reads metadata without renewing or exposing the captured cookie", () => {
  const now = Date.parse("2026-11-12T16:00:00Z");
  const state = { cookies: [{ name: "__Host-kidease.admin.seen", value: "private-idle-value", expires: (now + 60000) / 1000 }] };
  const unchanged = JSON.stringify(state);
  const validity = fixtureValidityFromState(state, now);
  const result = assertFixtureValidity({ validity }, now);
  assert.equal(result.remainingMs, 60000);
  assert.equal(validity.adminIdleExpiresAt, "2026-11-12T16:01:00.000Z");
  assert.equal(JSON.stringify(validity).includes("private-idle-value"), false);
  assert.equal(JSON.stringify(state), unchanged);
});

test("an expired, boundary-expired, missing or inconsistent deadline cannot pass preflight", () => {
  const deadline = Date.parse("2026-11-12T16:00:00Z");
  const validity = { adminIdleExpiresEpochMs: deadline, adminIdleExpiresAt: new Date(deadline).toISOString() };
  assert.throws(() => assertFixtureValidity({ validity }, deadline), { code: "FIXTURE_EXPIRED" });
  assert.throws(() => assertFixtureValidity({ validity }, deadline + 1), { code: "FIXTURE_EXPIRED" });
  assert.throws(() => assertFixtureValidity({}, deadline));
  assert.throws(() => assertFixtureValidity({ validity: { ...validity, adminIdleExpiresAt: "2026-11-13T16:00:00Z" } }, deadline));
  assert.throws(() => fixtureValidityFromState({ cookies: [] }, deadline));
  assert.throws(() => fixtureValidityFromState({ cookies: [{ name: "__Host-kidease.admin.seen", expires: -1 }] }, deadline));
});

test("health and indirect status probes are blocked after path normalization", () => {
  for (const path of ["/api/health", "/status", "/fr/status", "/status/", "//fr//status//", "/%73tatus", "/fr/%73tatus", "/api/%2568ealth", "/status?details=1"])
    assert.equal(isForbiddenFixturePath(path), true, path);
  for (const path of ["/", "/search", "/fr/search", "/parent", "/api/e2e-seed", "/status-details", "/fr/status-extra", "/%invalid"])
    assert.equal(isForbiddenFixturePath(path), false, path);
});
