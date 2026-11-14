import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as holds from "../src/lib/tour-hold.ts";
import * as threads from "../src/lib/threads.ts";
import * as calendar from "../src/lib/tour-calendar.ts";
import * as leads from "../src/lib/lead-requests.ts";

const source = (path) => readFileSync(new URL(`../src/lib/server/${path}.ts`, import.meta.url), "utf8");

// Executes the actual server handlers/SQL; unexpected writes and side-effect
// dependencies fail closed. Only the explicitly synthetic database is reachable.
function handlers(path, sql, effects) {
  const forbidden = () => { effects.push("side-effect"); throw new Error("Unexpected side effect"); };
  const chain = () => ({ middleware: chain, validator: chain, handler: (fn) => fn });
  const deps = {
    "@tanstack/react-start": { createServerFn: chain },
    "@/lib/db": { getSql: async () => sql },
    "@/lib/tour-hold": holds,
    "@/lib/threads": threads,
    "@/lib/tour-calendar": calendar,
    "@/lib/lead-requests": leads,
    "@/lib/server/safety": { omitHiddenParents: async (_sql, rows) => rows },
    "@/lib/server/coparent": { familyScopeFor: async (id) => ({ dataUserId: id }) },
    "@/lib/features": { tourCalendarEnabled: () => false },
    "@/lib/server/centre-access": { canCentreWriteLeadsFor: async () => true },
    "@/lib/server/roles": { requireAdmin: async () => {} },
    "@/lib/utils": { nid: () => "synthetic-id" },
  };
  const exports = {};
  const output = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", output)((name) => deps[name] ?? new Proxy({}, { get: () => forbidden }), exports);
  return exports;
}

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (id text primary key, name text, slug text);
    create table "user" (id text primary key, name text, email text);
    create table provider_daycares (user_id text, daycare_id text);
    create table centre_members (user_id text, daycare_id text, status text);
    create table tour_requests (
      id text primary key, conversation_id text, daycare_id text, user_id text,
      child_id text, child_name text, preferred_times text default '[]', parent_note text,
      status text, centre_note text, created_at timestamptz, responded_at timestamptz,
      window_id text, hold_expires_at timestamptz, parent_first_name text,
      parent_last_name text, parent_phone text, contact_email text, responded_by text
    );
    create table lead_requests (
      id text primary key, kind text, status text, user_id text, daycare_id text,
      parent_first_name text, parent_last_name text, parent_phone text, contact_email text,
      message text, reply_note text, source_kind text, source_id text, conversation_id text,
      created_at timestamptz default now(), updated_at timestamptz default now(), responded_at timestamptz
    );
    insert into daycares values ('a', 'Centre A', 'a'), ('b', 'Centre B', 'b');
    insert into "user" values ('parent-a', 'A', 'a@example.invalid'), ('parent-b', 'B', 'b@example.invalid');
    insert into provider_daycares values ('owner-a', 'a');
    begin;
    insert into tour_requests (id, conversation_id, daycare_id, user_id, status, created_at, hold_expires_at, window_id) values
      ('due', 'cv-a', 'a', 'parent-a', 'pending', now() - interval '1 hour', now(), 'old'),
      ('fallback', 'cv-a', 'a', 'parent-a', 'pending', now() - interval '48 hours', null, 'old'),
      ('live', 'cv-a', 'a', 'parent-a', 'pending', now() - interval '1 hour', now() + interval '1 hour', 'old'),
      ('accepted', 'cv-a', 'a', 'parent-a', 'accepted', now() - interval '80 hours', null, 'old'),
      ('other', 'cv-b', 'b', 'parent-b', 'pending', now() - interval '80 hours', null, 'other');
    insert into lead_requests (id, kind, status, user_id, daycare_id, source_kind, source_id) values
      ('lead-due', 'tour', 'requested', 'parent-a', 'a', 'tour_request', 'due'),
      ('lead-live', 'tour', 'requested', 'parent-a', 'a', 'tour_request', 'live'),
      ('lead-other', 'tour', 'requested', 'parent-b', 'b', 'tour_request', 'other'),
      ('wrong-tenant', 'tour', 'requested', 'parent-a', 'a', 'tour_request', 'other');
  `);
  const now = (await pg.query("select now() as at")).rows[0].at.getTime();
  const queries = [];
  let allowTourUpdates = false;
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
    queries.push(text);
    assert.ok(/^\s*select\b/i.test(text) || (allowTourUpdates && /^\s*update tour_requests\b/i.test(text)), `Unexpected database write: ${text}`);
    // Match db.ts date OID normalization; timestamptz remains a driver Date.
    return (await pg.query(text, values)).rows.map((row) => row.window_date instanceof Date
      ? { ...row, window_date: row.window_date.toISOString().slice(0, 10) } : row);
  };
  return { pg, sql, queries, now, allowUpdates: () => { allowTourUpdates = true; } };
}

test("pure expiry projects only due pending at <= deadline, with 48-hour fallback", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const createdAt = "2026-11-10T12:00:00Z";
  for (const holdExpiresAt of [null, undefined, "invalid", "2026-11-12T12:00:00Z"]) {
    assert.equal(holds.effectiveTourStatus({ status: "pending", createdAt, holdExpiresAt }, now), "expired");
  }
  assert.equal(holds.effectiveTourStatus({ status: "pending", createdAt, holdExpiresAt: new Date(now + 1).toISOString() }, now), "pending");
  for (const status of ["accepted", "declined", "expired", "completed", "enrolled", "lost"]) {
    assert.equal(holds.effectiveTourStatus({ status, createdAt }, now), status);
  }
});

test("parent/centre/conversation reads project expiry without writes or cross-tenant effects", async (t) => {
  const f = await fixture(); t.after(() => f.pg.close());
  t.mock.method(Date, "now", () => f.now);
  const effects = []; const h = handlers("tours", f.sql, effects);
  const before = (await f.pg.query("select * from tour_requests order by id")).rows;
  for (const [userId, desk] of [["parent-a", "parent"], ["owner-a", "centre"]]) {
    const rows = await h.listTourRequests({ context: { userId }, data: { desk } });
    assert.deepEqual(rows.map((row) => row.id).sort(), ["accepted", "due", "fallback", "live"]);
    assert.equal(rows.find((row) => row.id === "due").status, "expired");
    assert.equal(rows.find((row) => row.id === "fallback").status, "expired");
    assert.equal(rows.find((row) => row.id === "live").status, "pending");
    assert.equal(rows.find((row) => row.id === "accepted").status, "accepted");
    assert.equal(rows.find((row) => row.id === "due").respondedAt, null);
    assert.equal(rows.find((row) => row.id === "due").centreNote, null);
  }
  const conversation = await h.listToursForConversation(f.sql, "cv-a");
  assert.equal(conversation.find((row) => row.id === "fallback").status, "expired");
  assert.deepEqual((await f.pg.query("select * from tour_requests order by id")).rows, before);
  assert.deepEqual(effects, []);
  assert.ok(f.queries.every((query) => /^\s*select\b/i.test(query)));
});

test("lead lists/counts agree with expiry while source joins preserve tenant and stored times", async (t) => {
  const f = await fixture(); t.after(() => f.pg.close()); t.mock.method(Date, "now", () => f.now);
  const effects = []; const h = handlers("lead-requests", f.sql, effects);
  const before = (await f.pg.query("select * from lead_requests order by id")).rows;
  const rows = await h.listLeadRequests({ context: { userId: "parent-a" }, data: { desk: "parent" } });
  assert.equal(rows.find((row) => row.id === "lead-due").status, "declined");
  assert.equal(rows.find((row) => row.id === "lead-live").status, "requested");
  assert.equal(rows.find((row) => row.id === "wrong-tenant").status, "requested");
  assert.equal(rows.find((row) => row.id === "lead-due").respondedAt, null);
  assert.equal(rows.some((row) => row.id === "lead-other"), false);
  const counts = await h.listAdminLeadCounts({ context: { userId: "admin" } });
  assert.equal(counts.declined, 2); assert.equal(counts.requested, 2);
  assert.deepEqual((await f.pg.query("select * from lead_requests order by id")).rows, before);
  assert.deepEqual(effects, []);
});

test("stale acceptance and proposal reject before side effects, without expiring unrelated rows", async (t) => {
  const f = await fixture(); t.after(() => f.pg.close()); t.mock.method(Date, "now", () => f.now);
  const effects = []; const h = handlers("tours", f.sql, effects);
  for (const tourId of ["due", "fallback"]) {
    await assert.rejects(h.respondTourRequest({ context: { userId: "owner-a" }, data: { tourId, status: "accepted" } }), /already answered/);
    await assert.rejects(h.proposeTourTime({ context: { userId: "owner-a" }, data: { tourId, windowId: "new" } }), /cannot be rescheduled/);
  }
  assert.deepEqual(effects, []);
  assert.ok(f.queries.every((query) => /^\s*select\b/i.test(query)));
  assert.equal((await f.pg.query("select status from tour_requests where id = 'other'")).rows[0].status, "pending");
});

test("acceptance rechecks the database deadline after the read and loses an expiry race", async (t) => {
  const f = await fixture(); t.after(() => f.pg.close()); t.mock.method(Date, "now", () => f.now);
  const effects = []; f.allowUpdates();
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    const rows = await f.sql(strings, ...values);
    if (/select t.id, t.status/.test(text)) {
      await f.pg.query("update tour_requests set hold_expires_at = now() where id = 'live'");
    }
    return rows;
  };
  const h = handlers("tours", sql, effects);
  await assert.rejects(h.respondTourRequest({ context: { userId: "owner-a" }, data: { tourId: "live", status: "accepted" } }), /already answered or expired/);
  assert.equal((await f.pg.query("select status from tour_requests where id = 'live'")).rows[0].status, "pending");
  assert.deepEqual(effects, []);
});

test("driver Date deadlines retain fractional milliseconds in list projections", async (t) => {
  const f = await fixture(); t.after(() => f.pg.close());
  const now = Math.floor(f.now / 1000) * 1000 + 500;
  t.mock.method(Date, "now", () => now);
  await f.pg.query("update tour_requests set hold_expires_at = $1 where id = 'due'", [new Date(now + 400)]);
  const h = handlers("tours", f.sql, []);
  const rows = await h.listToursForConversation(f.sql, "cv-a");
  assert.equal(rows.find((row) => row.id === "due").status, "pending");
  assert.equal(rows.find((row) => row.id === "due").holdExpiresAt, new Date(now + 400).toISOString());
  assert.equal(holds.effectiveTourStatus({ status: "pending", createdAt: new Date(now - 1000), holdExpiresAt: new Date(now + 400) }, now), "pending");
  const l = handlers("lead-requests", f.sql, []);
  const leadRows = await l.listLeadRequests({ context: { userId: "parent-a" }, data: { desk: "parent" } });
  assert.equal(leadRows.find((row) => row.id === "lead-due").status, "requested");
});

test("reschedule keeps exact database microseconds in its optimistic deadline guard", async (t) => {
  const f = await fixture(); t.after(() => f.pg.close()); t.mock.method(Date, "now", () => f.now);
  await f.pg.exec(`
    create table tour_windows (id text, daycare_id text, window_date date, start_time time,
      end_time time, capacity int, timezone text, start_at timestamptz);
    insert into tour_windows values ('new', 'a', '2030-01-01', '10:00', '10:30', 1, 'UTC', '2030-01-01T10:00:00Z');
    update tour_requests set hold_expires_at = '2030-01-01T10:00:00.123456Z' where id = 'live';
  `);
  f.allowUpdates();
  const effects = [];
  const h = handlers("tours", f.sql, effects);
  // The read/write guard succeeds. The fixture deliberately blocks the subsequent
  // system-message write; no notification implementation is available.
  await assert.rejects(h.proposeTourTime({ context: { userId: "owner-a" }, data: { tourId: "live", windowId: "new" } }), /Unexpected database write/);
  assert.equal((await f.pg.query("select window_id from tour_requests where id = 'live'")).rows[0].window_id, "new");
  assert.deepEqual(effects, []);
});

test("reschedule loses deadline, status and window races after its initial read without side effects", async (t) => {
  const races = [
    ["deadline expired", "update tour_requests set hold_expires_at = now() where id = 'live'"],
    ["deadline renewed", "update tour_requests set hold_expires_at = now() + interval '2 hours' where id = 'live'"],
    ["status accepted", "update tour_requests set status = 'accepted' where id = 'live'"],
    ["window moved", "update tour_requests set window_id = 'raced' where id = 'live'"],
  ];
  for (const [name, change] of races) {
    await t.test(name, async (t) => {
      const f = await fixture(); t.after(() => f.pg.close());
      t.mock.method(Date, "now", () => f.now);
      await f.pg.exec(`
        create table tour_windows (id text, daycare_id text, window_date date, start_time time,
          end_time time, capacity int, timezone text, start_at timestamptz);
        insert into tour_windows values ('new', 'a', '2030-01-01', '10:00', '10:30', 1, 'UTC', '2030-01-01T10:00:00Z');
      `);
      f.allowUpdates();
      const effects = [];
      const leadsBefore = (await f.pg.query("select * from lead_requests order by id")).rows;
      let racedRows;
      let raceCount = 0;
      const sql = async (strings, ...values) => {
        const rows = await f.sql(strings, ...values);
        if (/select t.id, t.status, t.created_at/.test(strings.join("?"))) {
          raceCount += 1;
          await f.pg.exec(change);
          racedRows = (await f.pg.query("select * from tour_requests order by id")).rows;
        }
        return rows;
      };
      const h = handlers("tours", sql, effects);
      await assert.rejects(
        h.proposeTourTime({ context: { userId: "owner-a" }, data: { tourId: "live", windowId: "new", note: "Do not persist" } }),
        /changed or expired/,
      );
      assert.equal(raceCount, 1);
      assert.equal(f.queries.filter((query) => /^\s*update tour_requests\b/i.test(query)).length, 1);
      assert.deepEqual((await f.pg.query("select * from tour_requests order by id")).rows, racedRows);
      assert.deepEqual((await f.pg.query("select * from lead_requests order by id")).rows, leadsBefore);
      assert.deepEqual(effects, []);
    });
  }
});
