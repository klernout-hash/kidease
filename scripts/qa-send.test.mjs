import assert from "node:assert/strict";
import test from "node:test";
import { parseQaAllowlist, qaSendDecision, senderIsKidEaseMailbox } from "../src/lib/qa-send.ts";

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
  assert.deepEqual(parseQaAllowlist("*"), ["*"]);
  assert.equal(qaSendDecision({ ...base, allowlist: ["*"], recipient: "parent@example.com" }).deliver, true);
  assert.equal(qaSendDecision({ ...base, allowlist: ["*"], recipient: "parent@example.com", occurredAt: "2026-11-01T00:00:00.000Z" }).reason, "pre_enable");
  assert.equal(qaSendDecision({ ...base, allowlist: ["*"], recipient: "parent@example.com", alreadySent: true }).reason, "duplicate");
  assert.equal(qaSendDecision({ ...base, allowlist: ["*"], channel: "sms" }).reason, "held_channel");
  assert.equal(qaSendDecision({ ...base, alreadySent: true }).reason, "duplicate");
  assert.equal(qaSendDecision({ ...base, feature: "ADM-21" }).reason, "bad_feature");
});

