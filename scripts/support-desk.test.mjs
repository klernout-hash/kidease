import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  handleSupportOwnerReply,
  isSupportReplyAttempt,
  ownerAlertText,
  ownerReplyThreadId,
  shouldSendOwnerSms,
  supportCopy,
  supportPreview,
  supportRateAllows,
  supportRoleLabel,
  threadIdFromOwnerReply,
} from "../src/lib/support-desk.ts";
import { supportDeskEnabled } from "../src/lib/features.ts";
import { localePath } from "../src/lib/locale-path.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("support chat stays off unless the flag is on", () => {
  assert.match(read("src/lib/flags.ts"), /FEATURE_SUPPORT_CHAT: false/);
  assert.match(read("src/lib/flags.ts"), /FEATURE_SUPPORT_SMS_REPLY: false/);
  assert.match(read("src/lib/server/support-desk.ts"), /if \(!supportDeskEnabled\(\)\)/);
  assert.match(read("src/components/support-desk-panel.tsx"), /if \(!enabled\) return null/);
});

test("unavailable support offers a localized contact route without a launch promise", () => {
  assert.equal(supportDeskEnabled({ FEATURE_SUPPORT_CHAT: "0" }), false);
  assert.equal(supportDeskEnabled({ FEATURE_SUPPORT_CHAT: "1" }), true);
  assert.match(supportCopy.en.off, /unavailable.*contact KidEase/i);
  assert.match(supportCopy.fr.off, /indisponible.*Contactez KidEase/);
  for (const locale of ["en", "fr"]) {
    assert.doesNotMatch(supportCopy[locale].off, /yet|not open|nothing.*sent|activation|FEATURE_|pas encore|n’est pas ouverte|rien.*envoyé/i);
    assert.match(supportCopy[locale].contact, /KidEase/);
  }
  assert.equal(localePath("/contact", "en"), "/contact");
  assert.equal(localePath("/contact", "fr"), "/fr/contact");
  const panel = read("src/components/support-desk-panel.tsx");
  const unavailable = panel.slice(panel.indexOf("if (!enabled) {"), panel.indexOf('data-open="yes"'));
  assert.match(unavailable, /to=\{localePath\("\/contact", locale\)\}/);
  assert.match(unavailable, /min-h-11 min-w-11/);
  assert.match(unavailable, /focus-visible:ring-2/);
  assert.doesNotMatch(unavailable, /<form|postSupportDesk/);
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

test("only the owner phone can reply, and only to a full thread id", () => {
  const owner = "+15555550100";
  const threads = [{ id: "id_newest00001" }, { id: "id_target00002" }];
  const off = handleSupportOwnerReply({ flagOn: false, from: owner, ownerPhone: owner, body: "hello", threads });
  assert.equal(off.status, 404);
  for (const [from, ownerPhone] of [["+15555550999", owner], ["", ""], [owner, ""]]) {
    const bad = handleSupportOwnerReply({ flagOn: true, from, ownerPhone, body: "hello #id_target00002", threads });
    assert.equal(bad.status, 401);
    assert.equal(bad.threadId, null);
  }
  const ok = handleSupportOwnerReply({ flagOn: true, from: "(555) 555-0100", ownerPhone: owner, body: "On it #id_target00002", threads });
  assert.deepEqual(ok, { status: 200, threadId: "id_target00002", text: "On it" });
  assert.equal(threadIdFromOwnerReply("Thanks #id_target00002", threads), "id_target00002");
  assert.equal(threadIdFromOwnerReply("Thanks #000002", threads), null);
  assert.equal(threadIdFromOwnerReply("Thanks", threads), null);
  assert.equal(threadIdFromOwnerReply("#id_newest00001 #id_target00002", threads), null);
  assert.match(ownerAlertText({ role: "Parent", name: "Ada", preview: "Hi", threadId: "id_target00002" }), /#id_target00002$/);
  assert.match(read("src/lib/server/support-desk.ts"), /requireSupport/);
  assert.doesNotMatch(read("src/lib/server/support-desk.ts"), /isBlocked/);
});

test("owner texts aimed at a support thread are told apart from live-chat replies", () => {
  assert.equal(ownerReplyThreadId("On it #id_target00002 #id_target00002 #KE-1234"), "id_target00002");
  assert.equal(ownerReplyThreadId("#id_target00002 #id_unknown"), null);
  assert.equal(ownerReplyThreadId("Thanks"), null);
  for (const body of ["On it #id_target00002", "#id_", "Re #ID_x", "Replying #a1b2c3", "#00002x done", "#abcdef"]) {
    assert.equal(isSupportReplyAttempt(body), true, body);
  }
  for (const body of ["#KE-1234 On my way", "KE-1234 hi", "Thanks, we will call you", "#Thanks so much", "#1 priority", "email a@b.c#abc123"]) {
    assert.equal(isSupportReplyAttempt(body), false, body);
  }
});
