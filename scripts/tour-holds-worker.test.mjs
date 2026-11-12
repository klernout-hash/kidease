import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerHooks } from "node:module";
import { PGlite } from "@electric-sql/pglite";

// Import the real worker with only its I/O edges replaced. The SQL below runs in
// a new, in-memory Postgres database; no application DB or notification transport opens.
const workerUrl = new URL("../src/lib/server/tour-holds.ts", import.meta.url).href;
const stubs = {
  "@/lib/db": "export const getSql = async () => globalThis.__tourHoldWorkerTest.sql;",
  "@/lib/utils": "export const nid = () => `msg-${++globalThis.__tourHoldWorkerTest.nextId}`;",
  "@/lib/server/tour-hold-notify": `
    export const notifyTourParties = (...args) => globalThis.__tourHoldWorkerTest.notify(...args);
    export const syncLeadFromTour = (...args) => globalThis.__tourHoldWorkerTest.sync(...args);
  `,
  "@/lib/server/tour-reminders": `
    export const sendDueTourReminders = (...args) => globalThis.__tourHoldWorkerTest.reminders(...args);
  `,
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === workerUrl) {
      if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
      if (specifier === "@/lib/tour-hold") return { url: new URL("../src/lib/tour-hold.ts", import.meta.url).href, shortCircuit: true };
      if (specifier === "@/lib/threads") return { url: new URL("../src/lib/threads.ts", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { expireDueTourHolds, runExpireTourHoldsJob } = await import(workerUrl);
after(() => {
  hooks.deregister();
  delete globalThis.__tourHoldWorkerTest;
});

async function fixture({ afterScan, beforeClaim, failScan = false, boundaryRows = false } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (id text primary key, name text);
    create table tour_requests (
      id text primary key, conversation_id text, user_id text, daycare_id text,
      status text, hold_expires_at timestamptz, created_at timestamptz,
      centre_note text, responded_at timestamptz, contact_email text,
      parent_first_name text, parent_last_name text
    );
    create table conversations (id text primary key, last_at timestamptz);
    create table messages (id text primary key, conversation_id text, sender text, body text, kind text);
    create table lead_requests (source_id text primary key, status text);
    insert into daycares values ('centre-a', 'DEMO A'), ('centre-b', 'DEMO B');
    begin;
    insert into tour_requests (id, conversation_id, user_id, daycare_id, status, hold_expires_at, created_at)
    values
      ('due', 'thread-due', 'parent-a', 'centre-a', 'pending', now(), now() - interval '48 hours'),
      ('legacy', 'thread-legacy', 'parent-b', 'centre-b', 'pending', null, now() - interval '48 hours'),
      ('future', 'thread-future', 'parent-a', 'centre-a', 'pending', now() + interval '1 hour', now() - interval '49 hours'),
      ('accepted', 'thread-accepted', 'parent-b', 'centre-b', 'accepted', now() - interval '1 hour', now() - interval '49 hours'),
      ('other', 'thread-other', 'parent-b', 'centre-b', 'pending', null, now() - interval '47 hours');
    insert into conversations select conversation_id, null from tour_requests;
    insert into lead_requests select id, 'pending' from tour_requests;
  `);
  if (!boundaryRows) await pg.exec("update tour_requests set status = 'declined' where id = 'legacy'");
  const calls = { queries: [], notices: [], syncs: [], reminders: [] };
  const run = async (text, values = []) => {
    calls.queries.push(text.trim());
    const scan = /from tour_requests t/.test(text);
    const claim = /update tour_requests/.test(text);
    if (scan && failScan) throw new Error("synthetic scan failure");
    if (claim && beforeClaim) await beforeClaim(pg, text, values);
    const { rows } = await pg.query(text, values);
    if (scan && afterScan) await afterScan(pg, rows);
    return rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = run;
  globalThis.__tourHoldWorkerTest = {
    sql,
    nextId: 0,
    notify: async (_sql, input) => { calls.notices.push(input); },
    sync: async (_sql, id, status) => {
      calls.syncs.push({ id, status });
      await pg.query("update lead_requests set status = $1 where source_id = $2", [status, id]);
    },
    reminders: async (input) => { calls.reminders.push(input); },
  };
  return {
    pg,
    calls,
    async close() { await pg.exec("rollback"); await pg.close(); },
  };
}

function overlappingScans() {
  let arrivals = 0;
  let release;
  const bothScanned = new Promise((resolve) => { release = resolve; });
  return async () => {
    arrivals += 1;
    if (arrivals === 2) release();
    if (arrivals <= 2) await bothScanned;
  };
}

async function assertNoExpiryEffects({ pg, calls }) {
  assert.equal((await pg.query("select count(*)::int as n from messages")).rows[0].n, 0);
  assert.equal((await pg.query("select count(*)::int as n from conversations where last_at is not null")).rows[0].n, 0);
  assert.deepEqual(calls.notices, []);
  assert.deepEqual(calls.syncs, []);
}

test("worker dry-run includes exact deadline and 48h fallback without writes or notices, and forwards reminder dry-run", async () => {
  const f = await fixture({ boundaryRows: true });
  try {
    assert.deepEqual(await runExpireTourHoldsJob({ dryRun: true }), { ok: true, expired: 2, dryRun: true });
    assert.equal(f.calls.queries.length, 1);
    assert.match(f.calls.queries[0], /^select /);
    await assertNoExpiryEffects(f);
    assert.deepEqual(f.calls.reminders, [{ dryRun: true }]);
  } finally { await f.close(); }
});

test("overlapping worker scans and a later duplicate run persist and notify each claimed hold only once", async () => {
  const f = await fixture({ afterScan: overlappingScans() });
  try {
    const results = await Promise.all([expireDueTourHolds(), expireDueTourHolds()]);
    assert.deepEqual(results.map((r) => r.expired).sort(), [0, 1]);
    assert.equal((await f.pg.query("select count(*)::int as n from messages")).rows[0].n, 1);
    assert.equal((await f.pg.query("select count(*)::int as n from conversations where last_at is not null")).rows[0].n, 1);
    assert.deepEqual(f.calls.syncs, [{ id: "due", status: "expired" }]);
    assert.equal(f.calls.notices.length, 1);
    assert.equal(f.calls.notices[0].daycareId, "centre-a");
    assert.equal(f.calls.notices[0].parentUserId, "parent-a");
    assert.equal((await f.pg.query("select status from lead_requests where source_id = 'due'")).rows[0].status, "expired");
    assert.equal((await f.pg.query("select status from tour_requests where id = 'accepted'")).rows[0].status, "accepted");
    assert.equal((await f.pg.query("select status from tour_requests where id = 'other'")).rows[0].status, "pending");
    assert.equal((await expireDueTourHolds()).expired, 0);
    assert.equal(f.calls.notices.length, 1);
    assert.equal(f.calls.syncs.length, 1);
  } finally { await f.close(); }
});

test("worker rechecks both acceptance and renewed deadline after the due scan", async (t) => {
  for (const change of ["accepted", "renewed"]) {
    await t.test(change, async () => {
      const f = await fixture({ afterScan: async (pg) => {
        await pg.exec(change === "accepted"
          ? "update tour_requests set status = 'accepted' where id = 'due'"
          : "update tour_requests set hold_expires_at = now() + interval '48 hours' where id = 'due'");
      } });
      try {
        assert.deepEqual(await expireDueTourHolds(), { ok: true, expired: 0, dryRun: false });
        await assertNoExpiryEffects(f);
        const { rows } = await f.pg.query("select status, responded_at, centre_note from tour_requests where id = 'due'");
        assert.equal(rows[0].status, change === "accepted" ? "accepted" : "pending");
        assert.equal(rows[0].responded_at, null);
        assert.equal(rows[0].centre_note, null);
      } finally { await f.close(); }
    });
  }
});

test("failed worker scan or claim rejects instead of reporting success or notifying", async (t) => {
  for (const operation of ["scan", "claim"]) {
    await t.test(operation, async () => {
      const f = await fixture({
        failScan: operation === "scan",
        beforeClaim: operation === "claim" ? async () => { throw new Error("synthetic claim failure"); } : undefined,
      });
      try {
        await assert.rejects(() => expireDueTourHolds(), new RegExp(`synthetic ${operation} failure`));
        await assertNoExpiryEffects(f);
        assert.equal((await f.pg.query("select status from tour_requests where id = 'due'")).rows[0].status, "pending");
      } finally { await f.close(); }
    });
  }
});

test("worker notify=false still persists the exact-boundary and legacy expiry without sending notices", async () => {
  const f = await fixture({ boundaryRows: true });
  try {
    assert.deepEqual(await expireDueTourHolds({ notify: false }), { ok: true, expired: 2, dryRun: false });
    assert.equal((await f.pg.query("select count(*)::int as n from messages")).rows[0].n, 2);
    assert.equal((await f.pg.query("select count(*)::int as n from tour_requests where status = 'expired' and responded_at = now()")).rows[0].n, 2);
    assert.equal(f.calls.syncs.length, 2);
    assert.deepEqual(f.calls.notices, []);
  } finally { await f.close(); }
});
