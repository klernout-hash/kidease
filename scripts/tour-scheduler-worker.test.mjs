import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerHooks } from "node:module";
import { PGlite } from "@electric-sql/pglite";

// Real worker and SQL, with only database acquisition and notification edges
// replaced. No application credentials, network or production database are used.
const workerUrl = new URL("../src/lib/server/tour-holds.ts", import.meta.url).href;
const stubs = {
  "@/lib/db":
    "export const getSql = async () => { const f=globalThis.__tourWorker; if(f.failAcquire) throw Error('private acquisition detail'); return f.sql; };",
  "@/lib/utils": "export const nid = () => `msg-${++globalThis.__tourWorker.nextId}`;",
  "@/lib/server/tour-hold-notify": `
    export const notifyTourParties = (...args) => globalThis.__tourWorker.notify(...args);
    export const syncLeadFromTour = (...args) => globalThis.__tourWorker.sync(...args);
  `,
  "@/lib/server/tour-reminders":
    "export const sendDueTourReminders = (...args) => globalThis.__tourWorker.reminders(...args);",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === workerUrl) {
      if (stubs[specifier])
        return {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        };
      if (specifier === "@/lib/tour-hold")
        return {
          url: new URL("../src/lib/tour-hold.ts", import.meta.url).href,
          shortCircuit: true,
        };
      if (specifier === "@/lib/threads")
        return { url: new URL("../src/lib/threads.ts", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { expireDueTourHolds, runExpireTourHoldsJob, TourHoldExpiryError } = await import(workerUrl);
after(() => {
  hooks.deregister();
  delete globalThis.__tourWorker;
});

function reminderResult(dryRun = false) {
  return {
    ok: true,
    status: dryRun ? "dry_run" : "complete",
    dryRun,
    due: 0,
    eligible: 0,
    sent: 0,
    noticesConfirmed: 0,
    markedSent: 0,
    alreadyMarked: 0,
    failures: { scan: 0, notice: 0, mark: 0, entry: 0 },
  };
}

async function fixture({
  afterScan,
  beforeClaim,
  faults = [],
  boundaryRows = false,
  failAfterClaim = false,
} = {}) {
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
  if (!boundaryRows)
    await pg.exec("update tour_requests set status = 'declined' where id = 'legacy'");
  const failures = new Set(faults);
  const calls = { queries: [], notices: [], syncs: [], reminders: [] };
  const run = async (text, values = []) => {
    calls.queries.push(text.trim());
    const scan = /from tour_requests t/.test(text);
    const claim = /update tour_requests/.test(text);
    const operation = scan
      ? "scan"
      : claim
        ? "claim"
        : /insert into messages/.test(text)
          ? "message"
          : /update conversations/.test(text)
            ? "conversation"
            : "";
    if (failures.has(operation)) throw Error("private synthetic " + operation + " detail");
    if (claim && beforeClaim) await beforeClaim(pg, text, values);
    const { rows } = await pg.query(text, values);
    if (claim && failAfterClaim) throw Error("private uncertain claim acknowledgement");
    if (scan && afterScan) await afterScan(pg, rows);
    return rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = run;
  const state = {
    sql,
    nextId: 0,
    failAcquire: failures.has("acquire"),
    notify: async (_sql, input) => {
      calls.notices.push(input);
      if (failures.has("notifyThrow")) throw Error("private recipient detail");
      return { ok: !failures.has("notify"), errors: failures.has("notify") ? ["mail_failed"] : [] };
    },
    sync: async (_sql, id, status) => {
      calls.syncs.push({ id, status });
      if (failures.has("leadThrow")) throw Error("private lead detail");
      if (failures.has("lead")) return { ok: false, errors: ["lead_update"] };
      await pg.query("update lead_requests set status = $1 where source_id = $2", [status, id]);
      return { ok: true, errors: [] };
    },
    reminders: async (input) => {
      calls.reminders.push(input);
      if (failures.has("reminderThrow")) throw Error("private reminder detail");
      const result = reminderResult(input.dryRun);
      if (failures.has("reminder"))
        return {
          ...result,
          ok: false,
          status: "failed",
          failures: { ...result.failures, scan: 1 },
        };
      return result;
    },
  };
  globalThis.__tourWorker = state;
  return {
    pg,
    calls,
    state,
    failures,
    async close() {
      await pg.exec("rollback");
      await pg.close();
    },
  };
}

function overlappingScans() {
  let arrivals = 0,
    release;
  const both = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    if (++arrivals === 2) release();
    if (arrivals <= 2) await both;
  };
}
async function noEffects(f) {
  assert.equal((await f.pg.query("select count(*)::int as n from messages")).rows[0].n, 0);
  assert.equal(
    (await f.pg.query("select count(*)::int as n from conversations where last_at is not null"))
      .rows[0].n,
    0,
  );
  assert.deepEqual(f.calls.notices, []);
  assert.deepEqual(f.calls.syncs, []);
}

test("dry-run counts exact deadline and legacy fallback but confirms no expiry writes", async () => {
  const f = await fixture({ boundaryRows: true });
  try {
    const result = await runExpireTourHoldsJob({ dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.expired, 2);
    assert.equal(result.expiry.due, 2);
    assert.equal(result.expiry.claimed, 0);
    assert.equal(result.expiry.status, "dry_run");
    assert.equal(result.reminders.status, "dry_run");
    assert.equal(f.calls.queries.length, 1);
    await noEffects(f);
    assert.deepEqual(f.calls.reminders, [{ dryRun: true }]);
  } finally {
    await f.close();
  }
});

test("overlapping and repeated expiry emits effects only for the winning claim", async () => {
  const f = await fixture({ afterScan: overlappingScans() });
  try {
    const results = await Promise.all([expireDueTourHolds(), expireDueTourHolds()]);
    assert.deepEqual(results.map((r) => r.expired).sort(), [0, 1]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(
      results.reduce((n, r) => n + r.expiry.lostClaims, 0),
      1,
    );
    assert.equal((await f.pg.query("select count(*)::int as n from messages")).rows[0].n, 1);
    assert.equal(
      (await f.pg.query("select count(*)::int as n from conversations where last_at is not null"))
        .rows[0].n,
      1,
    );
    assert.deepEqual(f.calls.syncs, [{ id: "due", status: "expired" }]);
    assert.equal(f.calls.notices.length, 1);
    assert.equal((await expireDueTourHolds()).expired, 0);
    assert.equal(f.calls.notices.length, 1);
  } finally {
    await f.close();
  }
});

test("claim rechecks acceptance and renewed deadline after its scan", async (t) => {
  for (const change of ["accepted", "renewed"])
    await t.test(change, async () => {
      const f = await fixture({
        afterScan: async (pg) => {
          await pg.exec(
            change === "accepted"
              ? "update tour_requests set status = 'accepted' where id = 'due'"
              : "update tour_requests set hold_expires_at = now() + interval '48 hours' where id = 'due'",
          );
        },
      });
      try {
        const result = await expireDueTourHolds();
        assert.equal(result.ok, true);
        assert.equal(result.expired, 0);
        assert.equal(result.expiry.lostClaims, 1);
        await noEffects(f);
        const row = (
          await f.pg.query(
            "select status, responded_at, centre_note from tour_requests where id = 'due'",
          )
        ).rows[0];
        assert.equal(row.status, change === "accepted" ? "accepted" : "pending");
        assert.equal(row.responded_at, null);
        assert.equal(row.centre_note, null);
      } finally {
        await f.close();
      }
    });
});

test("acquisition, scan and claim failures reject with sanitized phase evidence", async (t) => {
  for (const operation of ["acquire", "scan", "claim"])
    await t.test(operation, async () => {
      const f = await fixture({ faults: [operation] });
      try {
        await assert.rejects(
          () => runExpireTourHoldsJob(),
          (error) => {
            assert.ok(error instanceof TourHoldExpiryError);
            assert.equal(error.result.ok, false);
            assert.equal(
              error.result.expiry.failures[operation === "acquire" ? "scan" : operation],
              1,
            );
            assert.doesNotMatch(error.message + JSON.stringify(error.result), /private/);
            assert.equal(error.result.expired, 0);
            return true;
          },
        );
        await noEffects(f);
        assert.deepEqual(f.calls.reminders, []);
      } finally {
        await f.close();
      }
    });
});

test("message, conversation, lead and notification failures never report a successful sweep", async (t) => {
  for (const operation of ["message", "conversation", "lead", "leadThrow", "notify", "notifyThrow"])
    await t.test(operation, async () => {
      const f = await fixture({ faults: [operation] });
      try {
        const result = await runExpireTourHoldsJob();
        const phase = operation.replace("Throw", "");
        assert.equal(result.ok, false);
        assert.equal(result.expired, 1);
        assert.equal(result.expiry.status, "failed");
        assert.equal(result.expiry.failures[phase], 1);
        assert.equal(result.expiry.messagesWritten, phase === "message" ? 0 : 1);
        assert.equal(result.expiry.conversationsUpdated, phase === "conversation" ? 0 : 1);
        assert.equal(result.expiry.leadSyncsCompleted, phase === "lead" ? 0 : 1);
        assert.equal(result.expiry.notificationsCompleted, phase === "notify" ? 0 : 1);
        assert.equal(result.reminders.ok, true);
        assert.equal(
          (await f.pg.query("select status from tour_requests where id='due'")).rows[0].status,
          "expired",
        );
        assert.doesNotMatch(JSON.stringify(result), /private/);
      } finally {
        await f.close();
      }
    });
});

test("reminder failures are separate from successful expiry and never yield overall ok", async (t) => {
  for (const operation of ["reminder", "reminderThrow"])
    await t.test(operation, async () => {
      const f = await fixture({ faults: [operation] });
      try {
        const result = await runExpireTourHoldsJob();
        assert.equal(result.ok, false);
        assert.equal(result.expired, 1);
        assert.equal(result.expiry.status, "complete");
        assert.equal(result.reminders.status, "failed");
        assert.equal(result.reminders.failures[operation === "reminder" ? "scan" : "entry"], 1);
        assert.doesNotMatch(JSON.stringify(result), /private/);
      } finally {
        await f.close();
      }
    });
});

test("notify=false preserves expiry/message/lead effects without notification calls", async () => {
  const f = await fixture({ boundaryRows: true });
  try {
    const result = await expireDueTourHolds({ notify: false });
    assert.equal(result.ok, true);
    assert.equal(result.expired, 2);
    assert.equal(result.expiry.claimed, 2);
    assert.equal(result.expiry.messagesWritten, 2);
    assert.equal(result.expiry.notificationsCompleted, 0);
    assert.deepEqual(f.calls.notices, []);
    assert.equal(f.calls.syncs.length, 2);
    assert.equal(
      (await f.pg.query("select status from tour_requests where id='future'")).rows[0].status,
      "pending",
    );
    assert.equal(
      (await f.pg.query("select status from tour_requests where id='accepted'")).rows[0].status,
      "accepted",
    );
  } finally {
    await f.close();
  }
});

test("a later failed claim reports earlier confirmed changes without pretending rollback", async () => {
  let claims = 0;
  const f = await fixture({
    boundaryRows: true,
    beforeClaim: async () => {
      if (++claims === 2) throw Error("private second claim failure");
    },
  });
  try {
    await assert.rejects(
      () => expireDueTourHolds(),
      (error) => {
        assert.equal(error.result.expired, 1);
        assert.equal(error.result.expiry.messagesWritten, 1);
        assert.equal(error.result.expiry.failures.claim, 1);
        return true;
      },
    );
    assert.equal(
      (await f.pg.query("select count(*)::int as n from tour_requests where status='expired'"))
        .rows[0].n,
      1,
    );
    assert.equal(f.calls.notices.length, 1);
  } finally {
    await f.close();
  }
});

test("an uncertain claim acknowledgement sends no effects and does not invent a confirmed count", async () => {
  const f = await fixture({ failAfterClaim: true });
  try {
    await assert.rejects(
      () => expireDueTourHolds(),
      (error) => {
        assert.equal(error.result.expired, 0);
        assert.equal(error.result.expiry.failures.claim, 1);
        return true;
      },
    );
    assert.equal(
      (await f.pg.query("select status from tour_requests where id='due'")).rows[0].status,
      "expired",
    );
    await noEffects(f);
    assert.equal((await expireDueTourHolds()).expired, 0);
  } finally {
    await f.close();
  }
});
