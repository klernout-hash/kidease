import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { claimRequestStatusTransition } from "../src/lib/server/request-status-transition.ts";

// Exercise the actual enrollment handler against disposable Postgres/WASM.
// Only this handler is compiled: no auth signup, payment or provider modules load.
const source = readFileSync(new URL("../src/lib/server/family.ts", import.meta.url), "utf8");
const handlerSource = source.match(
  /export const updateRequestStatus[\s\S]*?(?=\nexport const createPayment)/,
)?.[0];
assert.ok(handlerSource, "Enrollment status handler must exist");
const compiled = ts.transpileModule(handlerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function fixture({ status = "requested", concurrentReads = 0, approvalError = null } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (id text primary key, name text, province text, spots_infant int, spots_toddler int, spots_preschool int, waitlist int);
    create table children (id text primary key, name text, birthdate text);
    create table bookings (id text primary key, user_id text, daycare_id text, child_id text, status text,
      age_group text, conversation_id text, start_date text, start_month text, schedule text, days text,
      parent_name text, status_updated_at timestamptz);
    create table conversations (id text primary key, user_id text, daycare_id text, last_at timestamptz);
    create table messages (id text primary key, conversation_id text, sender text, body text, kind text);
    insert into daycares values ('synthetic-centre', 'Synthetic Centre', 'MB', 5, 5, 5, 0);
    insert into children values ('synthetic-child', 'Synthetic Child', '2023-05-14');
    insert into conversations values ('synthetic-conversation', 'synthetic-parent', 'synthetic-centre', null);
  `);
  await pg.query(
    `insert into bookings values ('synthetic-request', 'synthetic-parent', 'synthetic-centre', 'synthetic-child',
    $1, 'preschool', 'synthetic-conversation', '2026-12-01', '2026-12', 'full', null, 'Synthetic Parent', null)`,
    [status],
  );
  const effects = { lead: 0, tours: 0, notice: 0, approvalChecks: 0 };
  let reached = 0;
  let releaseReads;
  const readsReady = new Promise((resolve) => {
    releaseReads = resolve;
  });
  const run = async (text, values = []) => {
    const result = (await pg.query(text, values)).rows;
    // Force the same stale initial snapshot for concurrent clicks. The winning
    // SQL transition must read its own current previous status after this gate.
    if (concurrentReads && /select b\.id, b\.user_id/.test(text)) {
      reached += 1;
      if (reached === concurrentReads) releaseReads();
      await readsReady;
    }
    return result;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = run;
  const modules = {
    "@/lib/server/child-portfolio": {
      assertEnrolmentApproval: async () => {
        effects.approvalChecks += 1;
        if (approvalError) throw new Error(approvalError);
      },
    },
    "@/lib/server/lead-intake-write": {
      rememberCentreLead: async () => {
        effects.lead += 1;
      },
    },
    "@/lib/server/pipeline-sync": {
      syncBookingLeadStatus: async () => undefined,
    },
    "@/lib/server/tours": {
      syncToursFromBooking: async () => {
        effects.tours += 1;
      },
    },
    "@/lib/server/waitlist-tracker": {
      notifyWaitlistStatusChange: async () => {
        effects.notice += 1;
      },
    },
  };
  let nextId = 0;
  const exports = {};
  const serverFn = {
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(fn) {
      return fn;
    },
  };
  vm.runInNewContext(compiled, {
    exports,
    createServerFn: () => serverFn,
    authMiddleware: {},
    getSql: async () => sql,
    providerMaySetBookingStatus: (next) =>
      ["under_review", "accepted", "waitlist", "declined"].includes(next),
    canCentreWriteLeadsFor: async (_sql, userId) => userId === "synthetic-owner",
    resolveAdminAccess: async () => ({ ok: false }),
    canUpdateBookingStatus: ({ ownedDaycareIds }) => ownedDaycareIds.includes("synthetic-centre"),
    accessDeniedMessage: () => "Synthetic access denied",
    claimRequestStatusTransition,
    formatAgeLabel: () => "Synthetic age",
    formatStart: () => "Synthetic start",
    scheduleLabel: () => "Synthetic schedule",
    statusUpdateMessage: (next) => `Synthetic status: ${next}`,
    nid: () => `synthetic-message-${++nextId}`,
    require: (name) => {
      assert.ok(
        Object.hasOwn(modules, name),
        "Unexpected module requested by isolated enrollment handler",
      );
      return modules[name];
    },
  });
  const update = (next, actor = "synthetic-owner") =>
    exports.updateRequestStatus({
      context: { userId: actor },
      data: { bookingId: "synthetic-request", status: next },
    });
  const state = async () => ({
    booking: (await pg.query("select status,status_updated_at from bookings")).rows[0],
    centre: (await pg.query("select spots_preschool,waitlist from daycares")).rows[0],
    messages: (await pg.query("select body,kind from messages order by id")).rows,
    effects: { ...effects },
  });
  return { pg, sql, update, state };
}

test("two simultaneous approval clicks claim one transition and one set of effects", async () => {
  const f = await fixture({ concurrentReads: 2 });
  try {
    await Promise.all([f.update("accepted"), f.update("accepted")]);
    const state = await f.state();
    assert.equal(state.booking.status, "accepted");
    assert.equal(state.centre.spots_preschool, 4, "exactly one place is consumed");
    assert.equal(state.messages.length, 1, "one local status message is written");
    assert.equal(state.effects.lead, 1);
    assert.equal(state.effects.tours, 1);
    assert.equal(state.effects.notice, 1);
  } finally {
    await f.pg.close();
  }
});

test("same accepted status replay leaves timestamps, capacity and all effects unchanged", async () => {
  const f = await fixture();
  try {
    await f.update("accepted");
    const before = await f.state();
    await f.update("accepted");
    assert.deepEqual(await f.state(), {
      ...before,
      effects: { ...before.effects, approvalChecks: 2 },
    });
  } finally {
    await f.pg.close();
  }
});

test("already active to accepted preserves capacity while recording its distinct transition", async () => {
  const f = await fixture({ status: "active" });
  try {
    await f.update("accepted");
    const state = await f.state();
    assert.equal(state.centre.spots_preschool, 5);
    assert.equal(state.messages.length, 1);
  } finally {
    await f.pg.close();
  }
});

test("authorization and child approval checks still deny before any mutation", async () => {
  const f = await fixture({ approvalError: "portfolio:incomplete" });
  try {
    const before = await f.state();
    await assert.rejects(f.update("accepted", "synthetic-other-owner"), /access denied/);
    assert.deepEqual(await f.state(), before);
    await assert.rejects(f.update("accepted"), /portfolio:incomplete/);
    assert.deepEqual(await f.state(), {
      ...before,
      effects: { ...before.effects, approvalChecks: 1 },
    });
  } finally {
    await f.pg.close();
  }
});

test("competing review and approval use current previous status rather than stale active snapshot", async () => {
  const f = await fixture({ status: "active", concurrentReads: 2 });
  try {
    await Promise.all([f.update("under_review"), f.update("accepted")]);
    const state = await f.state();
    assert.equal(state.booking.status, "accepted");
    assert.equal(
      state.centre.spots_preschool,
      4,
      "approval follows the actual review state, not the stale active read",
    );
    assert.equal(state.messages.length, 2, "each distinct transition owns one message");
    assert.equal(state.effects.tours, 2);
    assert.equal(state.effects.notice, 2);
  } finally {
    await f.pg.close();
  }
});

test("competing approval and decline return the actual locked previous state", async () => {
  const f = await fixture();
  try {
    const transitions = await Promise.all([
      claimRequestStatusTransition(f.sql, "synthetic-request", "accepted"),
      claimRequestStatusTransition(f.sql, "synthetic-request", "declined"),
    ]);
    assert.deepEqual(transitions, [
      { previousStatus: "requested" },
      { previousStatus: "accepted" },
    ]);
    assert.equal((await f.state()).booking.status, "declined");
  } finally {
    await f.pg.close();
  }
});

test("waitlist replay is inert and genuine waitlist re-entry retains its existing counter effect", async () => {
  const f = await fixture();
  try {
    await Promise.all([f.update("waitlist"), f.update("waitlist")]);
    const once = await f.state();
    assert.equal(once.centre.waitlist, 1);
    assert.equal(once.messages.length, 1);
    await f.update("waitlist");
    assert.deepEqual(await f.state(), once);
    await f.update("under_review");
    await f.update("waitlist");
    const reentered = await f.state();
    assert.equal(reentered.centre.waitlist, 2);
    assert.equal(reentered.messages.length, 3);
  } finally {
    await f.pg.close();
  }
});

test("a real accepted re-entry still consumes capacity and never drives a zero count below zero", async () => {
  const f = await fixture();
  try {
    await f.update("accepted");
    await f.update("under_review");
    await f.update("accepted");
    assert.equal((await f.state()).centre.spots_preschool, 3);
    await f.pg.query("update daycares set spots_preschool=0");
    await f.update("declined");
    await f.update("accepted");
    assert.equal((await f.state()).centre.spots_preschool, 0);
  } finally {
    await f.pg.close();
  }
});

test("legacy schema without status_updated_at keeps the atomic no-op guard", async () => {
  const f = await fixture();
  try {
    await f.pg.exec("alter table bookings drop column status_updated_at");
    const first = await claimRequestStatusTransition(f.sql, "synthetic-request", "accepted");
    const replay = await claimRequestStatusTransition(f.sql, "synthetic-request", "accepted");
    assert.deepEqual(first, { previousStatus: "requested" });
    assert.equal(replay, null);
    assert.equal((await f.pg.query("select status from bookings")).rows[0].status, "accepted");
  } finally {
    await f.pg.close();
  }
});

test("an unrelated database failure is propagated without retrying an ambiguous write", async () => {
  let queries = 0;
  const failure = Object.assign(new Error("Synthetic connection failure"), { code: "08006" });
  const sql = {
    query: async () => {
      queries += 1;
      throw failure;
    },
  };
  await assert.rejects(claimRequestStatusTransition(sql, "synthetic-request", "accepted"), failure);
  assert.equal(queries, 1);
});

test("unsupported status remains rejected without any write or side effect", async () => {
  const f = await fixture();
  try {
    const before = await f.state();
    await assert.rejects(f.update("active"), /Invalid status/);
    assert.deepEqual(await f.state(), before);
  } finally {
    await f.pg.close();
  }
});
