import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  ENGAGEMENT_FOLLOWUPS,
  canAssignThread,
  holdAttachment,
  messageNoticePlan,
  messageReceipt,
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
  const first = planEngagementEvent({ ...base, event: "provider_reply", role: "provider", responseSeconds: 90 });
  const again = planEngagementEvent({ ...base, event: "provider_reply", role: "provider", responseSeconds: 10 });
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
  const seen = messageReceipt({ seenInApp: true, pushDelivered: true });
  assert.equal(seen.phoneSent, false);
  assert.equal(seen.label, "seen_in_kidease");
  assert.equal(messageReceipt({ seenInApp: false }).label, "saved_not_phoned");
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
  const sql = readFileSync(new URL("../migrations/0184_engagement_signals.sql", import.meta.url), "utf8");
  await pg.exec("create table conversations (id text primary key);");
  await pg.exec(sql);
  const plan = planEngagementEvent({
    event: "provider_reply",
    actorId: "user-1",
    centreId: "centre-1",
    threadId: "thread-1",
    role: "provider",
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
