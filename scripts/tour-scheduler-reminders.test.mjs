import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerHooks } from "node:module";
import { PGlite } from "@electric-sql/pglite";

const reminderUrl = new URL("../src/lib/server/tour-reminders.ts", import.meta.url).href;
const noticeUrl = new URL("../src/lib/server/parent-notice.ts", import.meta.url).href;
const utils = "export const nid = () => `notice-${++globalThis.__tourReminders.nextId}`;";
const stubs = {
  "@/lib/db":
    "export const getSql = async () => { const f=globalThis.__tourReminders; f.acquired++; if(f.failAcquire) throw Error('private connection detail'); return f.sql; };",
  "@/lib/features":
    "export const tourCalendarEnabled = () => globalThis.__tourReminders.enabled; export const tourPipelineEnabled = () => false;",
  "@/lib/utils": utils,
  "@/lib/tour-ics": `
    export const tourCalendarFile=()=>{},tourCalendarLinks=()=>{},tourCalendarMailText=()=>{},
      tourInviteCopy=()=>{},tourReminderAt=()=>{},tourSlotInstants=()=>{};
  `,
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === reminderUrl) {
      if (stubs[specifier])
        return {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        };
      if (specifier === "@/lib/server/parent-notice") return { url: noticeUrl, shortCircuit: true };
    }
    if (context.parentURL === noticeUrl) {
      if (specifier === "@/lib/utils")
        return { url: `data:text/javascript,${encodeURIComponent(utils)}`, shortCircuit: true };
      if (specifier === "@/lib/notifications")
        return {
          url: new URL("../src/lib/notifications.ts", import.meta.url).href,
          shortCircuit: true,
        };
      if (specifier === "./runtime-schema")
        return {
          url: "data:text/javascript,export const ensureUserNotifications=async()=>{globalThis.__tourReminders.schemaCalls++;};",
          shortCircuit: true,
        };
    }
    return nextResolve(specifier, context);
  },
});
const { sendDueTourReminders } = await import(reminderUrl);
const { saveParentInAppNotice } = await import(noticeUrl);
after(() => {
  hooks.deregister();
  delete globalThis.__tourReminders;
});

const now = new Date("2026-11-14T12:00:00.000Z");
async function fixture({ enabled = true, faults = [], extras = false, afterScan } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create table tour_requests (id text primary key, status text);
    create table tour_reminders (
      id text primary key, tour_id text, user_id text, daycare_name text, locale text,
      email text, remind_at timestamptz, sent_at timestamptz
    );
    create table user_notifications (
      id text primary key, user_id text, kind text, title_key text, href text,
      source_key text, daycare_name text, status text, created_at timestamptz,
      unique (user_id, source_key)
    );
    insert into tour_requests values ('tour-pending','pending'),('tour-accepted','accepted'),
      ('tour-cancelled','cancelled'),('tour-guest','pending'),('tour-future','accepted');
    insert into tour_reminders (id,tour_id,user_id,daycare_name,locale,remind_at) values
      ('pending','tour-pending','parent-a','DEMO','en','2026-11-14T12:00:00Z');
  `);
  if (extras)
    await pg.exec(`
    insert into tour_reminders (id,tour_id,user_id,daycare_name,locale,remind_at) values
      ('accepted','tour-accepted','parent-b','DEMO','fr','2026-11-14T11:59:59Z'),
      ('cancelled','tour-cancelled','parent-c','DEMO','en','2026-11-14T11:59:58Z'),
      ('guest','tour-guest','guest:demo','DEMO','en','2026-11-14T11:59:57Z'),
      ('missing','tour-missing','parent-d','DEMO','en','2026-11-14T11:59:56Z'),
      ('future','tour-future','parent-b','DEMO','en','2026-11-14T12:00:01Z');
  `);
  const failures = new Set(faults);
  const calls = [];
  const run = async (text, values = []) => {
    calls.push(text.trim());
    const scan = /from tour_reminders r/.test(text);
    const operation = scan
      ? "scan"
      : /insert into user_notifications/.test(text)
        ? "notice"
        : /update tour_reminders/.test(text)
          ? "mark"
          : "";
    if (failures.has(operation)) throw Error("private synthetic " + operation + " detail");
    const { rows } = await pg.query(text, values);
    if (scan && afterScan) await afterScan();
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
    enabled,
    nextId: 0,
    acquired: 0,
    schemaCalls: 0,
    failAcquire: failures.has("acquire"),
  };
  globalThis.__tourReminders = state;
  return { pg, sql, state, calls, failures, close: () => pg.close() };
}
async function counts(f) {
  return {
    notices: (await f.pg.query("select count(*)::int as n from user_notifications")).rows[0].n,
    marked: (
      await f.pg.query("select count(*)::int as n from tour_reminders where sent_at is not null")
    ).rows[0].n,
  };
}

test("calendar flag off is explicit and does not acquire a database", async () => {
  const f = await fixture({ enabled: false });
  try {
    const result = await sendDueTourReminders({ now });
    assert.equal(result.ok, true);
    assert.equal(result.status, "flag_off");
    assert.equal(result.sent, 0);
    assert.equal(result.due, 0);
    assert.equal(f.state.acquired, 0);
    assert.equal(f.state.schemaCalls, 0);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(await counts(f), { notices: 0, marked: 0 });
  } finally {
    await f.close();
  }
});

test("reminder dry-run uses exact due boundary and has no notice or sent-at writes", async () => {
  const f = await fixture({ extras: true });
  try {
    const result = await sendDueTourReminders({ now, dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.status, "dry_run");
    assert.equal(result.due, 5);
    assert.equal(result.eligible, 2);
    assert.equal(result.noticesConfirmed, 0);
    assert.equal(result.markedSent, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.state.schemaCalls, 0);
    assert.deepEqual(await counts(f), { notices: 0, marked: 0 });
  } finally {
    await f.close();
  }
});

test("only due open non-guest reminders write bell notices; duplicates remain deduped", async () => {
  const f = await fixture({ extras: true });
  try {
    const result = await sendDueTourReminders({ now });
    assert.equal(result.ok, true);
    assert.equal(result.due, 5);
    assert.equal(result.eligible, 2);
    assert.equal(result.noticesConfirmed, 2);
    assert.equal(result.sent, 2);
    assert.equal(result.markedSent, 5);
    assert.deepEqual(await counts(f), { notices: 2, marked: 5 });
    const again = await sendDueTourReminders({ now });
    assert.equal(again.ok, true);
    assert.equal(again.due, 0);
    assert.deepEqual(await counts(f), { notices: 2, marked: 5 });
    assert.equal(
      (await f.pg.query("select sent_at from tour_reminders where id='future'")).rows[0].sent_at,
      null,
    );
  } finally {
    await f.close();
  }
});

test("reminder acquisition and scan failures cannot look like an empty healthy phase", async (t) => {
  for (const operation of ["acquire", "scan"])
    await t.test(operation, async () => {
      const f = await fixture({ faults: [operation] });
      try {
        const result = await sendDueTourReminders({ now });
        assert.equal(result.ok, false);
        assert.equal(result.status, "failed");
        assert.equal(result.failures.scan, 1);
        assert.doesNotMatch(JSON.stringify(result), /private/);
        assert.deepEqual(await counts(f), { notices: 0, marked: 0 });
      } finally {
        await f.close();
      }
    });
});

test("notice failure leaves the reminder due and reports no confirmed notice or sent mark", async () => {
  const f = await fixture({ faults: ["notice"] });
  try {
    const result = await sendDueTourReminders({ now });
    assert.equal(result.ok, false);
    assert.equal(result.failures.notice, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.noticesConfirmed, 0);
    assert.equal(result.markedSent, 0);
    assert.deepEqual(await counts(f), { notices: 0, marked: 0 });
    f.failures.clear();
    assert.equal((await sendDueTourReminders({ now })).ok, true);
    assert.deepEqual(await counts(f), { notices: 1, marked: 1 });
  } finally {
    await f.close();
  }
});

test("mark failure is explicit; retry confirms the stable existing notice without duplicating it", async () => {
  const f = await fixture({ faults: ["mark"] });
  try {
    const result = await sendDueTourReminders({ now });
    assert.equal(result.ok, false);
    assert.equal(result.failures.mark, 1);
    assert.equal(result.noticesConfirmed, 1);
    assert.equal(result.markedSent, 0);
    assert.deepEqual(await counts(f), { notices: 1, marked: 0 });
    f.failures.clear();
    const retry = await sendDueTourReminders({ now });
    assert.equal(retry.ok, true);
    assert.equal(retry.noticesConfirmed, 1);
    assert.equal(retry.markedSent, 1);
    assert.deepEqual(await counts(f), { notices: 1, marked: 1 });
  } finally {
    await f.close();
  }
});

test("overlapping reminder scans share one stable bell row and only one sent-at transition", async () => {
  let scans = 0,
    release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture({
    afterScan: async () => {
      if (++scans === 2) release();
      if (scans <= 2) await barrier;
    },
  });
  try {
    const results = await Promise.all([
      sendDueTourReminders({ now }),
      sendDueTourReminders({ now }),
    ]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(
      results.reduce((n, r) => n + r.markedSent, 0),
      1,
    );
    assert.equal(
      results.reduce((n, r) => n + r.alreadyMarked, 0),
      1,
    );
    assert.deepEqual(await counts(f), { notices: 1, marked: 1 });
  } finally {
    await f.close();
  }
});

test("strict notice option exposes a failed write while legacy callers retain catch behavior", async () => {
  const f = await fixture({ faults: ["notice"] });
  const input = {
    userId: "parent-a",
    kind: "tour",
    titleKey: "notifTourUpdated",
    href: "/parent?tab=tours",
    sourceKey: "tour-reminder:tour-pending",
  };
  try {
    await assert.doesNotReject(() => saveParentInAppNotice(f.sql, input));
    await assert.rejects(
      () => saveParentInAppNotice(f.sql, input, { strict: true }),
      /private synthetic notice detail/,
    );
    assert.deepEqual(await counts(f), { notices: 0, marked: 0 });
  } finally {
    await f.close();
  }
});
