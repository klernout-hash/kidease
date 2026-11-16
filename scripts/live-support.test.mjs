import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { liveSupportEnabled, supportSmsAlertEnabled } from "../src/lib/features.ts";
import {
  cleanIdempotencyKey,
  liveSupportCopy,
  mayListSupportThreads,
  mayReadSupportThread,
  mergeSupportOutbox,
  outboxAfterSend,
  planLiveSupportAlert,
  resolveSupportThreadId,
  supportAdminPath,
  supportAlertDue,
  supportAlertEmail,
  supportMessageSender,
  supportPushNotice,
  supportPushUrl,
  supportReferenceCode,
  supportRoleForAccount,
  supportRowsToMessages,
  supportSmsAlert,
  LIVE_SUPPORT_ALERT_WINDOW_MS,
} from "../src/lib/live-support.ts";
import { pushOpenPath } from "../src/lib/push-lifecycle.ts";
import { canAccessSupport } from "../src/lib/support.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("live support stays off unless the flag is on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_LIVE_SUPPORT_CHAT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SUPPORT_SMS_ALERT, false);
  assert.equal(liveSupportEnabled({ FEATURE_LIVE_SUPPORT_CHAT: "0" }), false);
  assert.equal(liveSupportEnabled({ FEATURE_LIVE_SUPPORT_CHAT: "1" }), true);
  assert.equal(supportSmsAlertEnabled({ FEATURE_LIVE_SUPPORT_CHAT: "1", FEATURE_SUPPORT_SMS_ALERT: "0" }), false);
  assert.equal(supportSmsAlertEnabled({ FEATURE_LIVE_SUPPORT_CHAT: "0", FEATURE_SUPPORT_SMS_ALERT: "1" }), false);
  assert.equal(supportSmsAlertEnabled({ FEATURE_LIVE_SUPPORT_CHAT: "1", FEATURE_SUPPORT_SMS_ALERT: "1" }), true);
  assert.match(read("src/components/support-desk-panel.tsx"), /if \(live\)/);
  assert.match(read("src/components/support-desk-panel.tsx"), /LiveSupportChat mode="member"/);
  assert.match(read("src/components/support-desk-panel.tsx"), /if \(!enabled\)/);
});

test("each person keeps one support thread and a repeat send key does not add another row", () => {
  assert.deepEqual(resolveSupportThreadId("thread-1", "thread-2"), { id: "thread-1", created: false });
  assert.deepEqual(resolveSupportThreadId("", "thread-2"), { id: "thread-2", created: true });
  assert.equal(cleanIdempotencyKey("abc"), null);
  assert.equal(cleanIdempotencyKey("send-key-1"), "send-key-1");
  const first = outboxAfterSend([{ key: "send-key-1", body: "Hello", createdAt: "2026-11-16T12:00:00Z", state: "sending" }], "send-key-1", false);
  assert.equal(first[0].state, "failed");
  assert.deepEqual(outboxAfterSend(first, "send-key-1", true), []);
  const messages = supportRowsToMessages([
    { id: "m1", sender: "user", body: "Hello", createdAt: "2026-11-16T12:00:00Z" },
    { id: "m2", sender: "admin", body: "We can help.", createdAt: "2026-11-16T12:01:00Z" },
  ]);
  assert.equal(messages[0].sender, "parent");
  assert.equal(messages[1].sender, "provider");
  assert.equal(supportMessageSender("member"), "user");
  assert.equal(supportMessageSender("staff"), "admin");
  const merged = mergeSupportOutbox(messages, [{ key: "k", body: "Again", createdAt: "2026-11-16T12:02:00Z", state: "sending" }], "member");
  assert.equal(merged.at(-1)?.body, "Again");
  assert.match(read("migrations/0176_support_chat.sql"), /user_id text not null unique/);
  assert.match(read("migrations/0208_live_support.sql"), /support_messages_idem_idx/);
  assert.match(read("src/lib/server/live-support.ts"), /on conflict \(thread_id, idempotency_key\) do nothing/);
});

test("parents and daycares see only their thread, and only KidEase staff see every thread", () => {
  assert.equal(mayReadSupportThread({ viewerId: "parent-1", ownerId: "parent-1", staff: false }), true);
  assert.equal(mayReadSupportThread({ viewerId: "parent-1", ownerId: "parent-2", staff: false }), false);
  assert.equal(mayReadSupportThread({ viewerId: "daycare-1", ownerId: "parent-2", staff: false }), false);
  assert.equal(mayReadSupportThread({ viewerId: "kyle", ownerId: "parent-2", staff: true }), true);
  assert.equal(mayListSupportThreads(false), false);
  assert.equal(mayListSupportThreads(true), true);
  assert.equal(canAccessSupport("parent"), false);
  assert.equal(canAccessSupport("provider"), false);
  assert.equal(canAccessSupport("admin"), true);
  assert.equal(canAccessSupport("support"), true);
  assert.equal(canAccessSupport("support_lead"), true);
  assert.match(read("src/lib/server/live-support.ts"), /if \(!staff\) return \{ enabled: true as const, ok: false as const, reason: "forbidden"/);
  assert.match(read("src/routes/admin-support.tsx"), /throw notFound\(\)/);
  assert.equal(supportRoleForAccount({ profileRole: "provider", hasCentre: true }), "Daycare");
  assert.equal(supportRoleForAccount({ profileRole: "parent", hasCentre: true }), "Daycare");
  assert.equal(supportRoleForAccount({ profileRole: "parent", hasCentre: false }), "Parent");
  assert.equal(supportReferenceCode("KE-0000-0000"), "KE-0000-0000");
  assert.equal(supportReferenceCode("not a number"), null);
});

test("a burst alerts once, push opens the thread, and the text leaves the message out", () => {
  const now = Date.parse("2026-11-16T18:00:00Z");
  assert.equal(LIVE_SUPPORT_ALERT_WINDOW_MS, 2 * 60 * 1000);
  assert.equal(supportAlertDue(null, now), true);
  assert.equal(supportAlertDue("2026-11-16T17:57:00Z", now), true);
  assert.equal(supportAlertDue("2026-11-16T17:59:00Z", now), false);
  assert.deepEqual(
    planLiveSupportAlert({ due: false, pushDelivered: false, smsFlagOn: true, smsPhone: "+12045550100", emailTo: "support@kidease.ca" }),
    { push: false, email: false, sms: false },
  );
  assert.deepEqual(
    planLiveSupportAlert({ due: true, pushDelivered: true, smsFlagOn: false, smsPhone: "+12045550100", emailTo: "support@kidease.ca" }),
    { push: true, email: false, sms: false },
  );
  assert.deepEqual(
    planLiveSupportAlert({ due: true, pushDelivered: false, smsFlagOn: true, smsPhone: "+12045550100", emailTo: "support@kidease.ca" }),
    { push: true, email: true, sms: true },
  );
  assert.equal(supportAlertEmail({}), "support@kidease.ca");
  const secret = "My child has a peanut allergy and needs a morning spot.";
  const notice = supportPushNotice({ role: "Parent", name: "Ada" });
  const sms = supportSmsAlert({ role: "Parent", name: "Ada", url: supportPushUrl("thread-1") });
  assert.equal(notice.body.includes(secret), false);
  assert.equal(sms.includes(secret), false);
  assert.match(notice.body, /Parent Ada/);
  assert.match(sms, /Parent Ada/);
  assert.equal(sms.includes("+"), false);
  const path = supportAdminPath("thread 1");
  assert.equal(pushOpenPath(supportPushUrl("thread 1")), path);
  assert.match(path, /^\/admin-support\?thread=/);
  assert.match(read("src/lib/server/live-support.ts"), /interval '2 minutes'/);
  assert.match(read("src/lib/server/live-support.ts"), /sendPushNotification/);
  assert.doesNotMatch(read("src/lib/live-support.ts"), /SUPPORT_ALERT_PHONE/);
  assert.doesNotMatch(read("src/components/live-support-chat.tsx"), /SUPPORT_ALERT_PHONE/);
});

test("English and French copy stays friendly and does not mention a government", () => {
  for (const locale of ["en", "fr"]) {
    const pack = liveSupportCopy[locale];
    const blob = Object.values(pack).join("\n");
    assert.match(pack.lead, locale === "fr" ? /Clavardez avec l’aide KidEase/ : /Chat with KidEase support/);
    assert.doesNotMatch(blob, /government|gouvernement|ministry|ministère|promise a reply|délai de réponse/i);
  }
  assert.doesNotMatch(read("src/lib/support-desk.ts"), /do not promise a reply time/);
  assert.doesNotMatch(read("src/lib/support-desk.ts"), /ne promettons pas/);
});
