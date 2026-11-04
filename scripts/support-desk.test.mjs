import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  handleSupportOwnerReply,
  ownerAlertText,
  shouldSendOwnerSms,
  supportPreview,
  supportRateAllows,
  supportRoleLabel,
  threadIdFromOwnerReply,
} from "../src/lib/support-desk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("support chat stays off unless the flag is on", () => {
  assert.match(read("src/lib/flags.ts"), /FEATURE_SUPPORT_CHAT: false/);
  assert.match(read("src/lib/flags.ts"), /FEATURE_SUPPORT_SMS_REPLY: false/);
  assert.match(read("src/lib/server/support-desk.ts"), /if \(!supportDeskEnabled\(\)\)/);
  assert.match(read("src/components/support-desk-panel.tsx"), /if \(!enabled\) return null/);
});

test("the owner phone is never bundled or written into the alert text", () => {
  const client = read("src/components/support-desk-panel.tsx") + read("src/lib/support-desk.ts");
  assert.doesNotMatch(client, /SUPPORT_ALERT_PHONE/);
  assert.doesNotMatch(client, /\+1\d{10}/);
  const text = ownerAlertText({ role: "Parent", name: "Ada", preview: "Need a spot", threadId: "thread-abc123" });
  assert.match(text, /Parent Ada/);
  assert.match(text, /Need a spot/);
  assert.equal(text.includes("+"), false);
  assert.equal(supportPreview("x".repeat(200)).length, 80);
});

test("owner texts batch to one per thread per 10 minutes", () => {
  const now = Date.parse("2026-11-04T15:00:00Z");
  assert.equal(shouldSendOwnerSms(null, now), true);
  assert.equal(shouldSendOwnerSms("2026-11-04T14:49:00Z", now), true);
  assert.equal(shouldSendOwnerSms("2026-11-04T14:55:00Z", now), false);
  assert.equal(supportRateAllows(19), true);
  assert.equal(supportRateAllows(20), false);
  assert.equal(supportRoleLabel("provider"), "Daycare");
  assert.equal(supportRoleLabel("parent"), "Parent");
});

test("a bad signature is rejected and a block does not stop support", () => {
  const off = handleSupportOwnerReply({ flagOn: false, signatureOk: true, body: "hello", threads: [] });
  assert.equal(off.status, 404);
  const bad = handleSupportOwnerReply({
    flagOn: true,
    signatureOk: false,
    body: "hello #abc123",
    threads: [{ id: "thread-abc123" }],
  });
  assert.equal(bad.status, 401);
  const threads = [{ id: "thread-abc123" }, { id: "other" }];
  assert.equal(threadIdFromOwnerReply("Thanks #abc123", threads), "thread-abc123");
  assert.match(read("src/lib/server/support-desk.ts"), /requireSupport/);
  assert.doesNotMatch(read("src/lib/server/support-desk.ts"), /isBlocked/);
});
