import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  ENGAGEMENT_FOLLOWUPS,
  canAssignThread,
  holdAttachment,
  messageNoticePlan,
  messageReceipt,
  persistedPushState,
  nextInboxAction,
  opaqueId,
  planEngagementEvent,
  readQuarantinedFile,
  searchAllowed,
  staffSeesThread,
  withinSevenDays,
} from "../src/lib/engagement.ts";

test("events drop QA, message text, and repeat the first reply once", () => {
  const base = {
    actorId: "user-1",
    centreId: "centre-1",
    threadId: "thread-1",
    role: "parent",
    environment: "test",
    qa: false,
    day: "2026-11-08",
  };
  assert.equal(planEngagementEvent({ ...base, event: "inquiry_sent", qa: true }), null);
  assert.equal(
    planEngagementEvent({ ...base, event: "inquiry_sent", extra: { body: "hello" } }),
    null,
  );
  const sent = planEngagementEvent({ ...base, event: "inquiry_sent" });
  assert.ok(sent);
  assert.equal(sent.actorHash.startsWith("a_"), true);
  assert.equal(sent.actorHash.includes("user-1"), false);
  assert.equal(JSON.stringify(sent).includes("@"), false);
  assert.equal(planEngagementEvent({ ...base, event: "provider_reply", role: "parent" }), null);
  assert.equal(planEngagementEvent({ ...base, event: "provider_reply", role: "guardian" }), null);
  const first = planEngagementEvent({ ...base, event: "provider_reply", role: "staff", responseSeconds: 90 });
  const again = planEngagementEvent({ ...base, event: "provider_reply", role: "owner", responseSeconds: 10 });
  assert.equal(first.dedupeKey, again.dedupeKey);
  assert.equal(first.responseSeconds, 90);
  assert.equal(planEngagementEvent({ ...base, event: "tour_outcome", tourOutcome: "maybe" }), null);
  assert.equal(opaqueId("a", "user-1"), opaqueId("a", "user-1"));
  assert.notEqual(opaqueId("a", "user-1"), opaqueId("a", "user-2"));
});

test("assignment, search, receipts, and files stay inside the centre", () => {
  assert.equal(canAssignThread("owner", true), true);
  assert.equal(canAssignThread("manager", true), true);
  assert.equal(canAssignThread("staff", true), false);
  assert.equal(canAssignThread("owner", false), false);
  assert.equal(staffSeesThread({ role: "staff", active: false, assignedTo: null, staffId: "s" }), false);
  assert.equal(staffSeesThread({ role: "staff", active: true, assignedTo: "other", staffId: "s" }), false);
  assert.equal(staffSeesThread({ role: "staff", active: true, assignedTo: "s", staffId: "s" }), true);
  assert.equal(staffSeesThread({ role: "staff", active: true, assignedTo: null, staffId: "s" }), true);
  assert.equal(searchAllowed("thread-b", ["thread-a"]), false);
  assert.equal(searchAllowed("thread-a", ["thread-a"]), true);
  const seen = messageReceipt({ userId: "parent-1", seenInApp: true, pushState: "not_sent" });
  assert.equal(seen.phone, "not_sent");
  assert.equal(seen.userId, "parent-1");
  assert.equal(messageReceipt({ userId: "parent-1", seenInApp: true }).phone, "unknown");
  assert.equal(messageReceipt({ userId: "parent-2", seenInApp: false, pushState: "sent" }).phone, "sent");
  assert.equal(messageReceipt({ userId: "parent-1", seenInApp: false, pushState: "sent" }).userId, "parent-1");
  assert.notEqual(messageReceipt({ userId: "parent-1", seenInApp: false, pushState: "sent" }).userId, "parent-2");
  assert.equal(persistedPushState({ unifiedOn: true, liveOn: true, pushArmed: true, actuallySent: true }), "sent");
  assert.equal(persistedPushState({ unifiedOn: true, liveOn: false, pushArmed: true, actuallySent: false }), "not_sent");
  assert.equal(holdAttachment({ mime: "image/gif", bytes: 100 }).ok, false);
  assert.equal(holdAttachment({ mime: "image/jpeg", bytes: 9_000_000 }).reason, "size");
  const held = holdAttachment({ mime: "application/pdf", bytes: 1000 });
  assert.equal(held.ok && held.status, "quarantine");
  assert.equal(held.ok && held.readable, false);
  assert.equal(readQuarantinedFile().reason, "quarantine");
  assert.equal(messageNoticePlan({ unifiedOn: false, liveOn: true }).email, "off");
  assert.equal(messageNoticePlan({ unifiedOn: true, liveOn: false }).inApp, "ready");
  assert.equal(messageNoticePlan({ unifiedOn: true, liveOn: false }).push, "off");
  assert.equal(withinSevenDays("2026-11-01T00:00:00Z", "2026-11-08T00:00:00Z"), true);
  assert.equal(withinSevenDays("2026-11-01T00:00:00Z", "2026-11-09T00:00:00Z"), false);
  assert.equal(nextInboxAction({ unread: true, viewerIsParent: false, providerReplied: false }), "reply");
  assert.equal(FLAG_DEFAULTS.FEATURE_PRIVATE_PHOTO_FEED, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_MEAL_PLANNING, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CHILD_CHECKIN, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_UNIFIED_ALERTS_LIVE, false);
  assert.equal(ENGAGEMENT_FOLLOWUPS.find((item) => item.id === "attachments").status, "deferred");
});

test("stored events are idempotent and a file cannot be marked clean", async () => {
  const pg = new PGlite();
  const sql = readFileSync(new URL("../migrations/0185_engagement_signals.sql", import.meta.url), "utf8");
  await pg.exec("create table conversations (id text primary key);");
  await pg.exec(sql);
  const plan = planEngagementEvent({
    event: "provider_reply",
    actorId: "user-1",
    centreId: "centre-1",
    threadId: "thread-1",
    role: "staff",
    environment: "test",
    qa: false,
    responseSeconds: 30,
    day: "2026-11-08",
  });
  await pg.query(
    "insert into engagement_events (id, dedupe_key, event_name, actor_hash, centre_hash, thread_hash, role, environment, response_seconds) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    ["e1", plan.dedupeKey, plan.event, plan.actorHash, plan.centreHash, plan.threadHash, plan.role, plan.environment, plan.responseSeconds],
  );
  await assert.rejects(
    pg.query(
      "insert into engagement_events (id, dedupe_key, event_name, actor_hash, centre_hash, thread_hash, role, environment) values ('e2',$1,'provider_reply',$2,$3,$4,'provider','test')",
      [plan.dedupeKey, plan.actorHash, plan.centreHash, plan.threadHash],
    ),
  );
  await pg.query(
    "insert into thread_files (id, conversation_id, uploaded_by, mime, byte_size, status) values ('f','thread-1','user-1','application/pdf',120,'quarantine')",
  );
  await assert.rejects(
    pg.query("update thread_files set status = 'clean' where id = 'f'"),
  );
  const stored = await pg.query("select event_name, response_seconds from engagement_events");
  assert.equal(stored.rows[0].event_name, "provider_reply");
  assert.equal(JSON.stringify(stored.rows).includes("user-1"), false);
  await pg.close();
});

test("reading the centre thread clears the message count and leaves the bell row", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table conversations (id text primary key, user_id text, daycare_id text, last_at timestamptz default now());
    create table messages (id text primary key, conversation_id text, sender text, body text, created_at timestamptz default now());
    create table conversation_reads (conversation_id text, user_id text, last_read_at timestamptz, primary key (conversation_id, user_id));
    create table provider_daycares (user_id text, daycare_id text);
    create table user_notifications (id text primary key, user_id text, title_key text, read_at timestamptz);
    insert into conversations (id, user_id, daycare_id) values ('t', 'parent', 'centre');
    insert into provider_daycares (user_id, daycare_id) values ('provider', 'centre');
    insert into messages (id, conversation_id, sender, body) values ('m1', 't', 'parent', 'hello');
    insert into user_notifications (id, user_id, title_key, read_at) values ('n1', 'parent', 'notifInbox', null);
  `);
  const unread = async (userId) => {
    const rows = await pg.query(
      `select count(*)::int as n from conversations c
       where (c.user_id = $1 or exists (
         select 1 from provider_daycares p where p.user_id = $1 and p.daycare_id = c.daycare_id
       ))
       and exists (
         select 1 from messages m
         where m.conversation_id = c.id and m.sender <> 'system'
           and m.sender <> case when c.user_id = $1 then 'parent' else 'provider' end
           and m.created_at > coalesce(
             (select r.last_read_at from conversation_reads r where r.conversation_id = c.id and r.user_id = $1),
             '1970-01-01'::timestamptz
           )
       )`,
      [userId],
    );
    return rows.rows[0].n;
  };
  assert.equal(await unread("provider"), 1);
  assert.equal(await unread("parent"), 0);
  await pg.query("insert into conversation_reads (conversation_id, user_id, last_read_at) values ('t', 'provider', now())");
  assert.equal(await unread("provider"), 0);
  const bell = await pg.query("select count(*)::int as n from user_notifications where user_id = 'parent' and read_at is null");
  assert.equal(bell.rows[0].n, 1);
  await pg.close();
});

test("0185 sorts after the claim fee migration and applies on a fresh and upgraded database", async () => {
  const dir = new URL("../migrations/", import.meta.url);
  const names = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(names.includes("0184_engagement_signals.sql"), false);
  assert.equal(names.includes("0185_engagement_signals.sql"), true);
  const withClaim = [...names, "0184_claim_pending_fees.sql"].sort();
  assert.ok(withClaim.indexOf("0183_attendance_notice_eligibility.sql") < withClaim.indexOf("0184_claim_pending_fees.sql"));
  assert.ok(withClaim.indexOf("0184_claim_pending_fees.sql") < withClaim.indexOf("0185_engagement_signals.sql"));
  const claimSql = `
    create table if not exists listing_claims (id text primary key);
    alter table listing_claims add column if not exists fee_infant integer;
    alter table listing_claims add column if not exists fee_toddler integer;
    alter table listing_claims add column if not exists fee_preschool integer;
  `;
  const engagementSql = readFileSync(new URL("../migrations/0185_engagement_signals.sql", import.meta.url), "utf8");
  const files = [
    { name: "0184_claim_pending_fees.sql", sql: claimSql },
    { name: "0185_engagement_signals.sql", sql: engagementSql },
  ];
  async function apply(pg, pending) {
    await pg.exec("create table if not exists _migrations (name text primary key)");
    const done = await pg.query("select name from _migrations");
    const have = new Set(done.rows.map((row) => row.name));
    const ran = [];
    for (const file of pending) {
      if (have.has(file.name)) continue;
      await pg.exec(file.sql);
      await pg.query("insert into _migrations (name) values ($1)", [file.name]);
      ran.push(file.name);
    }
    return ran;
  }
  const fresh = new PGlite();
  await fresh.exec("create table conversations (id text primary key)");
  assert.deepEqual(await apply(fresh, files), ["0184_claim_pending_fees.sql", "0185_engagement_signals.sql"]);
  const fees = await fresh.query("select column_name from information_schema.columns where table_name = 'listing_claims'");
  assert.equal(fees.rows.some((row) => row.column_name === "fee_preschool"), true);
  const tables = await fresh.query("select table_name from information_schema.tables where table_name in ('engagement_events', 'message_push_state', 'thread_files')");
  assert.equal(tables.rows.length, 3);
  assert.deepEqual(await apply(fresh, files), []);
  await fresh.close();

  const upgraded = new PGlite();
  await upgraded.exec("create table conversations (id text primary key)");
  await upgraded.exec("create table _migrations (name text primary key)");
  await upgraded.query("insert into _migrations (name) values ('0183_attendance_notice_eligibility.sql')");
  await upgraded.exec(claimSql);
  await upgraded.query("insert into _migrations (name) values ('0184_claim_pending_fees.sql')");
  assert.deepEqual(await apply(upgraded, files), ["0185_engagement_signals.sql"]);
  const push = await upgraded.query("select to_regclass('message_push_state') as name");
  assert.equal(push.rows[0].name, "message_push_state");
  await upgraded.close();
});
