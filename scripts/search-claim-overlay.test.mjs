import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as evidence from "../src/lib/search-evidence.ts";

function fakeClock() {
  let now = 10_000;
  let sequence = 0;
  const timers = new Map();
  const flush = async () => { for (let index = 0; index < 32; index++) await Promise.resolve(); };
  class ClockDate extends Date {
    constructor(...values) { super(...(values.length ? values : [now])); }
    static now() { return now; }
  }
  return {
    Date: ClockDate,
    now: () => now,
    elapse: (milliseconds) => { now += milliseconds; },
    flush,
    setTimeout: (callback, milliseconds) => {
      const id = ++sequence;
      timers.set(id, { callback, at: now + Math.max(0, milliseconds) });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    tick: async (milliseconds) => {
      const until = now + milliseconds;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((left, right) => left[1].at - right[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Compile actual production code while replacing external boundaries and time only. */
function moduleFromSource(relative, dependencies, clock, declarations) {
  const path = new URL(`../${relative}`, import.meta.url);
  let source = readFileSync(path, "utf8");
  if (declarations) {
    const parsed = ts.createSourceFile(path.pathname, source, ts.ScriptTarget.Latest, true);
    const wanted = new Set(declarations);
    const selected = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && wanted.has(node.name?.text));
    assert.equal(selected.length, declarations.length);
    source = selected.map((node) => node.getText(parsed)).join("\n");
  }
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({
    exports: {}, Error, Date: clock.Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    ...dependencies,
  });
  new vm.Script(javascript, { filename: path.pathname }).runInContext(context);
  return context.exports;
}

function harness(overrides = {}) {
  const clock = fakeClock();
  const state = {
    queries: [], mapped: [], merged: [], acquisitions: [], active: 0, peak: 0, source: "neon", ...overrides,
  };
  const defaultRows = (ids) => ids.map((id) => ({ id, claimed_at: "2026-11-13", authoritative_field: `claimed:${id}` }));
  const sql = {
    query: async (text, parameters) => {
      const ids = Array.from(parameters[0]);
      const index = state.queries.length;
      state.queries.push({ text: text.replace(/\s+/g, " ").trim(), ids, parameters });
      state.active++;
      state.peak = Math.max(state.peak, state.active);
      try {
        return await (state.query ? state.query(ids, index, clock) : defaultRows(ids));
      } finally {
        state.active--;
      }
    },
  };
  const sqlWithin = moduleFromSource("src/lib/db.ts", {
    getSql: () => state.acquire ? state.acquire(sql, clock) : Promise.resolve(sql),
  }, clock, ["rejectSqlAfter", "getSqlWithin"]);
  const dependencies = {
    "@/lib/db": {
      dbSource: state.source,
      getSqlWithin: (milliseconds) => {
        state.acquisitions.push(milliseconds);
        return sqlWithin.getSqlWithin(milliseconds);
      },
    },
    "@/lib/server/catalog-neon": { CITY_TYPE_LIST_CAP: 2500 },
    "@/lib/server/map-row": {
      mapDaycare: (row) => {
        state.mapped.push(row);
        if (state.map) return state.map(row);
        return { id: row.id, mappedClaim: row.authoritative_field, live: true };
      },
    },
    "@/lib/search-evidence": evidence,
  };
  const aliases = {
    "../db": "@/lib/db", "./catalog-neon": "@/lib/server/catalog-neon", "./map-row": "@/lib/server/map-row",
    "../search-evidence": "@/lib/search-evidence",
  };
  const module = moduleFromSource("src/lib/server/search-claim-overlay.ts", {
    require: (specifier) => {
      const name = specifier.replace(/\.ts$/, "");
      const dependency = dependencies[aliases[name] ?? name];
      assert.ok(dependency, `unmocked production dependency: ${specifier}`);
      return dependency;
    },
  }, clock);
  const merge = (item, row) => {
    state.merged.push({ item, row });
    return state.merge ? state.merge(item, row) : { ...item, mappedClaim: row.mappedClaim, live: row.live };
  };
  return { clock, state, module, run: (items) => module.overlayClaimedSearchResult(items, merge), defaultRows };
}

const items = (count) => Array.from({ length: count }, (_, index) => ({ id: `centre-${index}`, original: index }));

function assertOrder(result, original) {
  assert.equal(result.rows.length, original.length);
  assert.deepEqual(Array.from(result.rows, (row) => row.id), original.map((row) => row.id));
  assert.deepEqual(Array.from(result.rows, (row) => row.original), original.map((row) => row.original));
}

function assertUnverified(result, retryable = true) {
  assert.equal(result.evidence.status, "unverified");
  assert.equal(result.evidence.totalKind, "available");
  assert.equal(result.evidence.retryable, retryable);
}

test("actual claimed reader batches unique IDs sequentially and preserves every original row, order and duplicate", async () => {
  const fixture = items(430);
  fixture.splice(2, 0, { id: "centre-0", original: "duplicate-early" });
  fixture.push({ id: "centre-200", original: "duplicate-late" });
  const before = JSON.stringify(fixture);
  const { run, state, module } = harness();
  assert.equal(module.CLAIM_OVERLAY_BATCH_SIZE, 192);
  assert.equal(module.CLAIM_OVERLAY_BUDGET_MS, 2000);
  const result = await run(fixture);
  assertOrder(result, fixture);
  assert.equal(JSON.stringify(fixture), before, "the reader must not mutate candidates");
  assert.deepEqual(state.queries.map((call) => call.ids.length), [192, 192, 46]);
  assert.equal(state.peak, 1);
  const queried = state.queries.flatMap((call) => call.ids);
  assert.equal(new Set(queried).size, 430);
  assert.equal(queried.length, 430);
  for (const call of state.queries) {
    assert.match(call.text, /^select \* from daycares where claimed_at is not null and id = any\(\$1::text\[\]\)/i);
    assert.equal(call.parameters.length, 1);
  }
  assert.equal(state.mapped.length, 430, "map each authoritative claimed row once");
  assert.equal(state.merged.length, 432, "merge every duplicate position independently");
  assert.equal(result.rows[2].mappedClaim, "claimed:centre-0");
  assert.equal(result.rows.at(-1).mappedClaim, "claimed:centre-200");
  assert.equal(result.evidence.status, "complete");
  assert.equal(result.evidence.totalKind, "exact");
  assert.equal(result.evidence.retryable, false);
  assert.equal(result.evidence.observedAt, 10_000);
  assert.deepEqual(state.acquisitions, [2000]);
});

test("successful empty claimed reads are complete; no candidates need no backend while backend-none remains unverified", async () => {
  const emptyRead = harness({ query: async () => [] });
  const fixture = items(250);
  const result = await emptyRead.run(fixture);
  assertOrder(result, fixture);
  assert.ok(result.rows.every((row, index) => row === fixture[index]));
  assert.equal(result.evidence.status, "complete");
  assert.equal(result.evidence.totalKind, "exact");
  assert.equal(emptyRead.state.queries.length, 2);
  assert.equal(emptyRead.state.mapped.length, 0);
  for (const source of ["none", "neon"]) {
    const emptyInput = harness({ source });
    const empty = await emptyInput.run([]);
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.evidence.status, "complete");
    assert.equal(emptyInput.state.acquisitions.length, 0);
    assert.equal(emptyInput.state.queries.length, 0);
  }
  const none = harness({ source: "none" });
  const unavailable = await none.run(fixture);
  assertOrder(unavailable, fixture);
  assertUnverified(unavailable);
  assert.ok(unavailable.evidence.reasons.includes("source-unavailable"));
  assert.equal(none.state.acquisitions.length, 0);
  assert.equal(none.state.queries.length, 0);
});

test("2500 unique-ID cap limits enrichment without truncating candidates or counting duplicate IDs twice", async () => {
  const fixture = items(2504);
  fixture.push({ id: "centre-0", original: "duplicate-after-cap" });
  const { run, state } = harness();
  const result = await run(fixture);
  assertOrder(result, fixture);
  assertUnverified(result, false);
  assert.deepEqual(Array.from(result.evidence.reasons), ["enrichment-limit"]);
  assert.equal(state.queries.length, 14);
  const queried = state.queries.flatMap((call) => call.ids);
  assert.equal(queried.length, 2500);
  assert.equal(new Set(queried).size, 2500);
  assert.ok(state.queries.every((call) => call.ids.length <= 192));
  assert.equal(state.peak, 1);
  assert.equal(result.rows[2499].mappedClaim, "claimed:centre-2499");
  assert.equal(result.rows[2500], fixture[2500]);
  assert.equal(result.rows.at(-1).mappedClaim, "claimed:centre-0");
});

test("reader has no private cache and re-reads claimed rows on a later call", async () => {
  let generation = "first";
  const { run, state } = harness({
    query: async (ids) => ids.map((id) => ({ id, claimed_at: "2026-11-13", authoritative_field: generation })),
  });
  const fixture = items(2);
  const first = await run(fixture);
  generation = "second";
  const second = await run(fixture);
  assert.equal(state.queries.length, 2);
  assert.equal(state.acquisitions.length, 2);
  assert.equal(first.rows[0].mappedClaim, "first");
  assert.equal(second.rows[0].mappedClaim, "second");
  assertOrder(first, fixture);
  assertOrder(second, fixture);
});

test("partial SQL failure retains prior batches and stops before requesting remaining IDs", async () => {
  const { run, state } = harness({
    query: async (ids, index) => {
      if (index === 1) throw new Error("mock SQL unavailable");
      return ids.map((id) => ({ id, claimed_at: "2026-11-13", authoritative_field: `claimed:${id}` }));
    },
  });
  const fixture = items(500);
  const result = await run(fixture);
  assertOrder(result, fixture);
  assertUnverified(result);
  assert.ok(result.evidence.reasons.includes("supplement-unavailable"));
  assert.equal(state.queries.length, 2);
  assert.equal(state.peak, 1);
  assert.equal(result.rows[191].mappedClaim, "claimed:centre-191");
  assert.equal(result.rows[192], fixture[192]);
  assert.equal(result.rows[499], fixture[499]);
});

test("malformed SQL rows roll back their entire batch and never publish unrequested or duplicate identities", async () => {
  for (const malformed of [
    null, {}, [null], [{ id: "centre-192" }], [{ id: "other-centre", claimed_at: "2026-11-13" }],
    [{ id: "centre-192", claimed_at: "2026-11-13" }, { id: "centre-192", claimed_at: "2026-11-13" }],
    [{ id: "centre-192", claimed_at: "2026-11-13" }, { id: "centre-193", claimed_at: "" }],
  ]) {
    const { run, state, defaultRows } = harness({ query: async (ids, index) => index === 1 ? malformed : defaultRows(ids) });
    const fixture = items(500);
    const result = await run(fixture);
    assertOrder(result, fixture);
    assertUnverified(result);
    assert.equal(state.queries.length, 2);
    assert.equal(result.rows[191].mappedClaim, "claimed:centre-191");
    assert.ok(result.rows.slice(192).every((row, index) => row === fixture[index + 192]));
  }
});

test("mapping and merge faults or changed IDs cannot partially publish a current batch", async () => {
  for (const fault of ["map-throw", "map-identity", "merge-throw", "merge-identity", "merge-null"]) {
    const fixture = items(500);
    const { run, state } = harness({
      map: (row) => {
        if (row.id === "centre-193" && fault === "map-throw") throw new Error("mapper failure");
        return { id: row.id === "centre-193" && fault === "map-identity" ? "changed-id" : row.id, mappedClaim: `claimed:${row.id}`, live: true };
      },
      merge: (item, row) => {
        if (item.id === "centre-193" && fault === "merge-throw") throw new Error("merge failure");
        if (item.id === "centre-193" && fault === "merge-null") return null;
        return { ...item, id: item.id === "centre-193" && fault === "merge-identity" ? "changed-id" : item.id, mappedClaim: row.mappedClaim };
      },
    });
    const result = await run(fixture);
    assertOrder(result, fixture);
    assertUnverified(result);
    assert.equal(state.queries.length, 2);
    assert.equal(result.rows[191].mappedClaim, "claimed:centre-191");
    assert.ok(result.rows.slice(192).every((row, index) => row === fixture[index + 192]), fault);
  }
});

test("invalid candidate IDs are retained but cannot be queried as complete enrichment", async () => {
  const fixture = [{ id: "", original: 0 }, { id: "  ", original: 1 }, { id: "centre-0", original: 2 }];
  const { run, state } = harness();
  const result = await run(fixture);
  assertOrder(result, fixture);
  assertUnverified(result);
  assert.deepEqual(state.queries[0].ids, ["centre-0"]);
  assert.equal(result.rows[0], fixture[0]);
  assert.equal(result.rows[1], fixture[1]);
});

test("one overall deadline bounds hanging SQL and late fulfillment cannot mutate or publish the returned result", async () => {
  const late = deferred();
  const { run, state, clock, defaultRows } = harness({ query: () => late.promise });
  let settled = false;
  const fixture = items(500);
  const pending = run(fixture).then((value) => { settled = true; return value; });
  await clock.flush();
  assert.equal(state.queries.length, 1);
  await clock.tick(1999);
  assert.equal(settled, false);
  await clock.tick(1);
  const result = await pending;
  assertUnverified(result);
  assert.ok(result.evidence.reasons.includes("search-timeout"));
  assertOrder(result, fixture);
  assert.equal(state.active, 1, "deadline stops waiting; it does not pretend to cancel SQL execution");
  const returned = JSON.stringify(result);
  late.resolve(defaultRows(state.queries[0].ids));
  await clock.flush();
  assert.equal(state.active, 0);
  assert.equal(state.queries.length, 1);
  assert.equal(state.mapped.length, 0);
  assert.equal(state.merged.length, 0);
  assert.equal(JSON.stringify(result), returned);
});

test("a slow successful batch consumes the shared deadline rather than granting a fresh budget to the next batch", async () => {
  const late = deferred();
  const { run, state, clock, defaultRows } = harness({
    query: (ids, index, timer) => index === 0
      ? new Promise((resolve) => timer.setTimeout(() => resolve(defaultRows(ids)), 1800))
      : late.promise,
  });
  const fixture = items(500);
  let settled = false;
  const pending = run(fixture).then((result) => { settled = true; return result; });
  await clock.flush();
  await clock.tick(1999);
  assert.equal(state.queries.length, 2);
  assert.equal(settled, false);
  await clock.tick(1);
  const result = await pending;
  assertUnverified(result);
  assertOrder(result, fixture);
  assert.equal(result.rows[191].mappedClaim, "claimed:centre-191");
  assert.equal(result.rows[192], fixture[192]);
  const returned = JSON.stringify(result);
  late.resolve(defaultRows(state.queries[1].ids));
  await clock.flush();
  assert.equal(state.queries.length, 2);
  assert.equal(JSON.stringify(result), returned);
});

test("pool acquisition is bounded within the same deadline and a late pool cannot start SQL", async () => {
  const pool = deferred();
  let sql;
  const { run, state, clock } = harness({ acquire: (connection) => { sql = connection; return pool.promise; } });
  const fixture = items(3);
  const pending = run(fixture);
  await clock.flush();
  assert.deepEqual(state.acquisitions, [2000]);
  await clock.tick(2000);
  const result = await pending;
  assertOrder(result, fixture);
  assertUnverified(result);
  assert.equal(state.queries.length, 0);
  pool.resolve(sql);
  await clock.flush();
  assert.equal(state.queries.length, 0);
  const rejected = harness({ acquire: async () => { throw new Error("pool failure"); } });
  const failed = await rejected.run(fixture);
  assertUnverified(failed);
  assert.equal(rejected.state.queries.length, 0);
});

test("getSqlWithin receives only the remaining budget and acquisition time does not extend the query deadline", async () => {
  const pool = deferred();
  const query = deferred();
  let sql;
  const { run, state, clock, defaultRows } = harness({
    acquire: (connection) => { sql = connection; return pool.promise; }, query: () => query.promise,
  });
  let settled = false;
  const fixture = items(300);
  const pending = run(fixture).then((value) => { settled = true; return value; });
  // Simulate event-loop work between creating the deadline and starting pool acquisition.
  clock.elapse(250);
  await clock.flush();
  assert.deepEqual(state.acquisitions, [1750]);
  await clock.tick(350);
  pool.resolve(sql);
  await clock.flush();
  assert.equal(state.queries.length, 1);
  await clock.tick(1399);
  assert.equal(settled, false);
  await clock.tick(1);
  const result = await pending;
  assertUnverified(result);
  assertOrder(result, fixture);
  assert.equal(clock.now(), 12_000);
  const returned = JSON.stringify(result);
  query.resolve(defaultRows(state.queries[0].ids));
  await clock.flush();
  assert.equal(state.queries.length, 1);
  assert.equal(JSON.stringify(result), returned);
});

test("mapping work that crosses the deadline rolls back the batch before publication", async () => {
  let localClock;
  const { run, state, clock } = harness({
    map: (row) => {
      localClock.elapse(2000);
      return { id: row.id, mappedClaim: "late mapping" };
    },
  });
  localClock = clock;
  const fixture = items(2);
  const result = await run(fixture);
  assertUnverified(result);
  assert.ok(result.evidence.reasons.includes("search-timeout"));
  assertOrder(result, fixture);
  assert.ok(result.rows.every((row, index) => row === fixture[index]));
  assert.equal(state.queries.length, 1);
});
