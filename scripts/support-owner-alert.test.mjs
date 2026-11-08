import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { canAccessSupport } from "../src/lib/support.ts";
import { planOwnerAlert } from "../src/lib/support-desk.ts";
import { supportEmailAlertEnabled, supportSmsReplyEnabled } from "../src/lib/features.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("chat on does not text or email unless that channel is on and a destination exists", () => {
  const phoneSet = planOwnerAlert({
    production: true,
    emailChannelOn: false,
    smsChannelOn: false,
    emailTo: "",
    phone: "+15555550100",
    alreadyEmailed: false,
    smsWindowOpen: true,
  });
  assert.equal(phoneSet.sms, "skip");
  assert.equal(phoneSet.smsReason, "channel_off");
  assert.equal(phoneSet.email, "skip");
  assert.equal(phoneSet.emailReason, "channel_off");
  assert.equal(phoneSet.phone === undefined, true);

  const noPhone = planOwnerAlert({
    production: true,
    emailChannelOn: false,
    smsChannelOn: true,
    emailTo: "owner@example.com",
    phone: " ",
    alreadyEmailed: false,
    smsWindowOpen: true,
  });
  assert.equal(noPhone.smsReason, "no_destination");
  assert.equal(noPhone.emailReason, "channel_off");

  const ready = planOwnerAlert({
    production: true,
    emailChannelOn: true,
    smsChannelOn: true,
    emailTo: "owner@example.com",
    phone: "+15555550100",
    alreadyEmailed: false,
    smsWindowOpen: true,
  });
  assert.equal(ready.email, "send");
  assert.equal(ready.sms, "send");

  const preview = planOwnerAlert({
    production: false,
    emailChannelOn: true,
    smsChannelOn: true,
    emailTo: "owner@example.com",
    phone: "+15555550100",
    alreadyEmailed: false,
    smsWindowOpen: true,
  });
  assert.equal(preview.email, "skip");
  assert.equal(preview.sms, "skip");
  assert.equal(preview.emailReason, "not_production");
});

test("the chat flag alone does not arm email or text", () => {
  const env = { FEATURE_SUPPORT_CHAT: "1", SUPPORT_ALERT_PHONE: "+15555550100", ADMIN_EMAIL: "owner@example.com" };
  assert.equal(supportSmsReplyEnabled(env), false);
  assert.equal(supportEmailAlertEnabled(env), false);
  assert.equal(supportEmailAlertEnabled({ ...env, SUPPORT_EMAIL_ALERTS: "1" }), true);
  assert.equal(supportSmsReplyEnabled({ ...env, FEATURE_SUPPORT_SMS_REPLY: "1" }), true);
  const server = read("src/lib/server/support-desk.ts");
  assert.match(server, /plan\.sms === "send"/);
  assert.match(server, /plan\.email === "send"/);
  assert.match(server, /where t\.user_id = \$\{context\.userId\}/);
  assert.match(server, /await requireSupport\(context\.userId\)/);
  assert.match(read("src/lib/server/roles.ts"), /assertTwoFactorVerified\(userId\)/);
  assert.equal(canAccessSupport("parent"), false);
  assert.equal(canAccessSupport("provider"), false);
  assert.equal(canAccessSupport("support"), true);
  assert.equal(canAccessSupport("admin"), true);
});

test("each signed-in person only reloads their own support thread", async () => {
  const pg = new PGlite();
  await pg.exec(read("migrations/0176_support_chat.sql"));
  await pg.query("insert into support_threads (id, user_id) values ('t-parent', 'parent-1'), ('t-centre', 'centre-1')");
  await pg.query(
    "insert into support_messages (id, thread_id, sender, body) values ('m1', 't-parent', 'user', 'Need a spot'), ('m2', 't-centre', 'user', 'Question about a claim')",
  );
  const parent = await pg.query(
    `select m.body from support_messages m join support_threads t on t.id = m.thread_id where t.user_id = $1`,
    ["parent-1"],
  );
  const centre = await pg.query(
    `select m.body from support_messages m join support_threads t on t.id = m.thread_id where t.user_id = $1`,
    ["centre-1"],
  );
  assert.deepEqual(parent.rows.map((row) => row.body), ["Need a spot"]);
  assert.deepEqual(centre.rows.map((row) => row.body), ["Question about a claim"]);
  const again = await pg.query("select body from support_messages where thread_id = 't-parent'");
  assert.deepEqual(again.rows.map((row) => row.body), ["Need a spot"]);
  await pg.close();
});
