import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CUSTOMER_ALERT_NOT_BEFORE,
  alertIsProspective,
  customerAlertSummary,
  sameMailbox,
} from "../src/lib/customer-alert-policy.ts";

test("alerts before the cutoff and missing times stay unsent", () => {
  assert.equal(alertIsProspective(null), false);
  assert.equal(alertIsProspective("not-a-date"), false);
  assert.equal(alertIsProspective("2020-01-01T00:00:00.000Z"), false);
  assert.equal(alertIsProspective(CUSTOMER_ALERT_NOT_BEFORE), true);
  assert.equal(alertIsProspective("2026-11-09T03:00:00.000Z"), true);
});

test("a message alert names the centre and not the message", () => {
  const secret = "The child takes insulin at noon and the door code is 4412.";
  const mail = customerAlertSummary({ kind: "message", centreName: "L'il Wheels Day Care", locale: "fr" });
  assert.match(mail.preview, /L'il Wheels Day Care/);
  assert.equal(mail.preview.includes(secret), false);
  assert.equal(mail.subject.includes(secret), false);
  assert.match(mail.preview, /nouveau message/i);
});

test("the sender is not the recipient", () => {
  assert.equal(sameMailbox("Parent@Example.com", "parent@example.com"), true);
  assert.equal(sameMailbox("parent@example.com", "centre@example.com"), false);
  assert.equal(sameMailbox("", "centre@example.com"), false);
});

test("the outbox drain requires the cutoff and does not read old rows", () => {
  const src = readFileSync(new URL("../src/lib/server/alert-dispatch.ts", import.meta.url), "utf8");
  assert.match(src, /created_at >=/);
  assert.match(src, /customerAlertCutoffMs/);
});
