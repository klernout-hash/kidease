import assert from "node:assert/strict";
import test from "node:test";
import { mergeSearchEvidence, readSearchEvidence, searchEvidence, withSearchRows } from "../src/lib/search-evidence.ts";
import { combineSearchReads, settleSearchRead } from "../src/lib/search-retrieval.ts";
import { flushSearchMemo, rememberSearch, searchMemoKey } from "../src/lib/server/search-memo.ts";

const exact = () => searchEvidence({ status: "complete", source: "primary", observedAt: 100 });
const limited = () => searchEvidence({ status: "partial", source: "primary", reasons: ["candidate-limit"], retryable: false, observedAt: 90 });
const snapshot = () => searchEvidence({ status: "unverified", source: "snapshot", reasons: ["source-fallback"], retryable: true, observedAt: 50 });
const batch = (rows, evidence = exact()) => ({ rows, evidence });
const policy = { cacheIf: (value) => !value.evidence.retryable };

test("missing, malformed or contradictory coverage never becomes an exact total", () => {
  for (const value of [undefined, null, {}, { version: 0 }, { ...exact(), observedAt: NaN },
    { ...exact(), reasons: ["source-unavailable"] }, { ...exact(), totalKind: "available" },
    { ...exact(), source: "snapshot" }, { ...exact(), reasons: ["source-fallback"] }]) {
    assert.equal(readSearchEvidence(value).status, "unverified");
    assert.equal(readSearchEvidence(value).totalKind, "available");
  }
  assert.equal(searchEvidence({ status: "complete", source: "primary", reasons: ["source-unavailable"] }).totalKind, "available");
  assert.equal(searchEvidence({ status: "complete", source: "primary", reasons: ["candidate-limit"] }).totalKind, "at-least");
  assert.deepEqual(readSearchEvidence(exact()), exact());
});

test("snapshot fallback counts are available counts, never authoritative lower bounds", () => {
  assert.equal(snapshot().totalKind, "available");
  const mixed = mergeSearchEvidence(exact(), snapshot());
  assert.equal(mixed.source, "mixed");
  assert.equal(mixed.status, "unverified");
  assert.equal(mixed.totalKind, "available");
  assert.equal(mixed.observedAt, 50);
});

test("filtering preserves raw-limit evidence even when no rows survive", () => {
  const raw = batch([{ id: "en" }, { id: "fr" }], limited());
  const empty = withSearchRows(raw, []);
  assert.equal(empty.evidence, raw.evidence);
  assert.equal(empty.evidence.totalKind, "at-least");
  assert.equal(empty.evidence.status, "partial");
  assert.equal(mergeSearchEvidence(exact(), limited()).status, "partial");
});

test("memo hits retain saturated raw evidence and observation time", async () => {
  flushSearchMemo();
  let reads = 0;
  const load = async () => { reads += 1; return batch([{ id: "fr" }], limited()); };
  const first = await rememberSearch("limited-cache", load, policy);
  const cached = await rememberSearch("limited-cache", load, policy);
  assert.equal(reads, 1);
  assert.deepEqual(cached, first);
  assert.equal(cached.evidence.observedAt, 90);
  assert.deepEqual(cached.evidence.reasons, ["candidate-limit"]);
});

test("nonempty timed-out subsets do not stick in the memo and explicit retry can recover", async () => {
  flushSearchMemo();
  let reads = 0;
  const load = async () => {
    reads += 1;
    return reads === 1 ? batch([{ id: "live-only" }], searchEvidence({
      status: "partial", source: "primary", reasons: ["search-timeout"], retryable: true,
    })) : batch([{ id: "catalogue" }, { id: "live-only" }]);
  };
  assert.equal((await rememberSearch("timeout-retry", load, policy)).evidence.status, "partial");
  const recovered = await rememberSearch("timeout-retry", load, { ...policy, refresh: true });
  assert.equal(reads, 2);
  assert.equal(recovered.evidence.status, "complete");
  assert.equal(recovered.rows.length, 2);
  await rememberSearch("timeout-retry", load, policy);
  assert.equal(reads, 2);
});

test("refresh bypasses a cached subset and old in-flight reads cannot overwrite recovery", async () => {
  flushSearchMemo();
  let release;
  const old = rememberSearch("inflight", () => new Promise((resolve) => { release = resolve; }), policy);
  await Promise.resolve();
  const refreshed = await rememberSearch("inflight", async () => batch([{ id: "new" }]), { ...policy, refresh: true });
  release(batch([{ id: "old" }], limited()));
  await old;
  const cached = await rememberSearch("inflight", async () => { throw new Error("must use fresh cache"); }, policy);
  assert.deepEqual(cached, refreshed);
  const changed = await rememberSearch("inflight", async () => batch([{ id: "newer" }]), { ...policy, refresh: true });
  assert.equal(changed.rows[0].id, "newer");
});

test("an old rejected request cannot delete a newer cached result", async () => {
  flushSearchMemo();
  let rejectOld;
  const old = rememberSearch("old-rejection", () => new Promise((_, reject) => { rejectOld = reject; }), policy);
  await Promise.resolve();
  const rejected = assert.rejects(old, /old failure/);
  await rememberSearch("old-rejection", async () => batch([{ id: "new" }]), { ...policy, refresh: true });
  rejectOld(new Error("old failure"));
  await rejected;
  const cached = await rememberSearch("old-rejection", async () => { throw new Error("must remain cached"); }, policy);
  assert.equal(cached.rows[0].id, "new");
});

test("exact empty envelopes can be cached while legacy empty arrays remain uncached", async () => {
  flushSearchMemo();
  let envelopeReads = 0;
  const load = async () => { envelopeReads += 1; return batch([]); };
  await rememberSearch("exact-empty", load, policy);
  await rememberSearch("exact-empty", load, policy);
  assert.equal(envelopeReads, 1);
  let arrayReads = 0;
  await rememberSearch("legacy-empty", async () => { arrayReads += 1; return []; });
  await rememberSearch("legacy-empty", async () => { arrayReads += 1; return []; });
  assert.equal(arrayReads, 2);
});

test("close origins and either work coordinate cannot reuse another circle's candidate memo", async () => {
  flushSearchMemo();
  const base = { lat: 49.90001, lng: -97.10001, lat2: 49.91, lng2: -97.11, radiusKm: 25, sort: "distance", ageGroup: "any" };
  const variants = [base, { ...base, lat: 49.90002 }, { ...base, lng: -97.10002 },
    { ...base, lat2: 49.91001 }, { ...base, lng2: -97.11001 }];
  assert.equal(new Set(variants.map(searchMemoKey)).size, variants.length);
  let reads = 0;
  for (const input of variants) await rememberSearch(searchMemoKey(input), async () => batch([{ id: String(++reads) }]), policy);
  for (const input of variants) await rememberSearch(searchMemoKey(input), async () => { throw new Error("cached repeat"); }, policy);
  assert.equal(reads, variants.length);
  assert.notEqual(searchMemoKey({ ...base, label: "a:b", q: "c" }), searchMemoKey({ ...base, label: "a", q: "b:c" }));
});

test("settling distinguishes exact empty success from timeout and source failure", async () => {
  assert.equal((await settleSearchRead(Promise.resolve(batch([])), 20)).kind, "result");
  assert.equal((await settleSearchRead(Promise.reject(new Error("unavailable")), 20)).kind, "error");
  assert.equal((await settleSearchRead(new Promise(() => {}), 1)).kind, "timeout");
});

test("live fallback preserves existing order and carries missing-source status", () => {
  const full = { kind: "result", batch: batch([{ id: "a" }, { id: "b" }]) };
  const live = { kind: "result", batch: batch([{ id: "b" }, { id: "c" }]) };
  const combined = combineSearchReads(full, live);
  assert.deepEqual(combined.rows.map((row) => row.id), ["c", "a", "b"]);
  assert.equal(combined.evidence.totalKind, "exact");
  const partial = combineSearchReads({ kind: "timeout" }, live);
  assert.equal(partial.evidence.totalKind, "at-least");
  assert.equal(partial.evidence.retryable, true);
  assert.ok(partial.evidence.reasons.includes("search-timeout"));
  const empty = combineSearchReads({ kind: "timeout" }, { kind: "result", batch: batch([]) });
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.evidence.status, "partial");
  const fallback = combineSearchReads({ kind: "error" }, { kind: "result", batch: batch([{ id: "snapshot" }], snapshot()) });
  assert.equal(fallback.evidence.totalKind, "available");
  assert.throws(() => combineSearchReads({ kind: "timeout" }, { kind: "error" }), /could not be loaded/);
});
