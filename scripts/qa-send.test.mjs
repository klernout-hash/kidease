import assert from "node:assert/strict";
import test from "node:test";
import {
  parseQaAllowlist,
  parseQaSmsAllowlist,
  previewEmailAllowed,
  previewPushAllowed,
  previewSmsAllowed,
  qaSendDecision,
  senderIsKidEaseMailbox,
} from "../src/lib/qa-send.ts";

const allow = ["kyle@kidease.ca", "klernout45@gmail.com"];
const base = {
  feature: "MSG-03",
  channel: "email",
  recipient: "kyle@kidease.ca",
  sender: "kyle@kidease.ca",
  occurredAt: "2026-11-11T09:00:00.000Z",
  enabledAt: "2026-11-11T08:40:00.000Z",
  alreadySent: false,
  allowlist: allow,
};

test("only the two approved inboxes can receive, and only by email from kidease.ca", () => {
  assert.deepEqual(parseQaAllowlist(" Kyle@KidEase.ca, klernout45@gmail.com "), allow);
  assert.equal(senderIsKidEaseMailbox("kyle@kidease.ca"), true);
  assert.equal(senderIsKidEaseMailbox("news@openroadoutlet.ca"), false);
  assert.equal(qaSendDecision(base).deliver, true);
  assert.equal(qaSendDecision({ ...base, recipient: "parent@example.com" }).reason, "dropped");
  assert.equal(qaSendDecision({ ...base, channel: "sms" }).reason, "held_channel");
  assert.equal(qaSendDecision({ ...base, channel: "push" }).reason, "held_channel");
  assert.equal(qaSendDecision({ ...base, sender: "news@openroadoutlet.ca" }).reason, "bad_sender");
  assert.equal(qaSendDecision({ ...base, occurredAt: "2026-11-01T00:00:00.000Z" }).reason, "pre_enable");
  assert.equal(qaSendDecision({ ...base, enabledAt: null }).reason, "enable_time_unset");
  assert.equal(qaSendDecision({ ...base, allowlist: [] }).reason, "empty_allowlist");
  assert.equal(qaSendDecision({ ...base, alreadySent: true }).reason, "duplicate");
  assert.equal(qaSendDecision({ ...base, feature: "ADM-21" }).reason, "bad_feature");
});

test("the preview gate blocks every recipient except the named lists", () => {
  const off = {};
  assert.equal(previewEmailAllowed("parent@example.com", off), true);
  assert.equal(previewSmsAllowed("+12045550199", off), true);
  const on = {
    QA_PREVIEW_SENDS: "1",
    QA_SEND_ALLOWLIST: "kyle@kidease.ca, klernout45@gmail.com",
    QA_SMS_ALLOWLIST: "",
    QA_PUSH_ALLOWLIST: "reviewer-parent@kidease.ca",
  };
  assert.equal(previewEmailAllowed("kyle@kidease.ca", on), true);
  assert.equal(previewEmailAllowed("klernout45@gmail.com", on), true);
  assert.equal(previewEmailAllowed("parent@example.com", on), false);
  assert.deepEqual(parseQaSmsAllowlist(""), []);
  assert.deepEqual(parseQaSmsAllowlist("204-555-0199"), ["+12045550199"]);
  assert.equal(previewSmsAllowed("+12045550199", on), false);
  assert.equal(previewSmsAllowed("+12045550199", { ...on, QA_SMS_ALLOWLIST: "+1 204 555 0199" }), true);
  assert.equal(previewSmsAllowed("+12045550100", { ...on, QA_SMS_ALLOWLIST: "+12045550199" }), false);
  assert.equal(previewPushAllowed("reviewer-parent@kidease.ca", on), true);
  assert.equal(previewPushAllowed("kyle@kidease.ca", on), false);
  assert.equal(previewPushAllowed("parent@example.com", on), false);
});
