import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterPublicAdminNotify,
  publicNotifyOk,
  publicSubmitResult,
  resolveMailReplyTo,
  sendMailThenPersist,
  shouldSendVisitorAutoReply,
  VISITOR_AUTO_REPLY_SUBJECT,
  VISITOR_AUTO_REPLY_TEXT,
} from "../src/lib/server/notify-mail.ts";

test("reply_to is the visitor email when present", () => {
  assert.equal(resolveMailReplyTo("kyle@openroadoutlet.ca", "kyle@kidease.ca"), "kyle@openroadoutlet.ca");
  assert.equal(resolveMailReplyTo("  parent@example.com  ", "kyle@kidease.ca"), "parent@example.com");
});

test("reply_to falls back when visitor email is blank", () => {
  assert.equal(resolveMailReplyTo("", "kyle@kidease.ca"), "kyle@kidease.ca");
  assert.equal(resolveMailReplyTo(null, "kyle@kidease.ca"), "kyle@kidease.ca");
  assert.equal(resolveMailReplyTo(undefined, "kyle@kidease.ca"), "kyle@kidease.ca");
  assert.equal(resolveMailReplyTo("   ", "kyle@kidease.ca"), "kyle@kidease.ca");
});

test("public contact succeeds only when mail sent or locally logged", () => {
  assert.equal(publicNotifyOk("sent"), true);
  assert.equal(publicNotifyOk("logged"), true);
  assert.equal(publicNotifyOk("failed"), false);
  assert.equal(publicNotifyOk("queued"), false);
});

test("successful send returns sent even when persist throws", async () => {
  const persistCalls = [];
  const result = await sendMailThenPersist({
    send: async () => "sent",
    persist: async (row) => {
      persistCalls.push(row);
      throw new Error("getSql() WASM failed");
    },
    onPersistError: () => undefined,
  });
  assert.deepEqual(result, { status: "sent", error: null });
  assert.equal(publicNotifyOk(result.status), true);
  assert.deepEqual(persistCalls, [{ status: "sent", error: null }]);
});

test("mail failure is returned even if persist also throws", async () => {
  const result = await sendMailThenPersist({
    send: async () => {
      throw new Error("Resend 403: domain not verified");
    },
    persist: async () => {
      throw new Error("getSql() failed");
    },
    onMailError: () => undefined,
    onPersistError: () => undefined,
  });
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /Resend 403/);
  assert.equal(publicNotifyOk(result.status), false);
});

test("persist still runs after a successful send", async () => {
  let persisted = null;
  const result = await sendMailThenPersist({
    send: async () => "sent",
    persist: async (row) => {
      persisted = row;
    },
  });
  assert.equal(result.status, "sent");
  assert.deepEqual(persisted, { status: "sent", error: null });
});

test("contact submit returns { ok: true } after send even when getSql() would throw", async () => {
  const result = await sendMailThenPersist({
    send: async () => "sent",
    persist: async () => {
      throw new Error("getSql() WASM failed");
    },
    onPersistError: () => undefined,
  });
  assert.deepEqual(publicSubmitResult(result.status, result.error), { ok: true });
});

test("contact submit throws when Resend fails", async () => {
  const result = await sendMailThenPersist({
    send: async () => {
      throw new Error("Resend 403: domain not verified");
    },
    persist: async () => undefined,
    onMailError: () => undefined,
  });
  assert.throws(() => publicSubmitResult(result.status, result.error), /Resend 403/);
});

test("auto-reply copy is the short thanks only", () => {
  assert.equal(VISITOR_AUTO_REPLY_SUBJECT, "We got your message — KidEase");
  assert.equal(
    VISITOR_AUTO_REPLY_TEXT,
    "Thanks for sending your request to KidEase. One of our KidEase representatives will get back to you within 24 hours.\n\nThank you",
  );
  assert.doesNotMatch(VISITOR_AUTO_REPLY_TEXT, /HELLO|General Question|kyle@openroadoutlet/i);
});

test("auto-reply is sent only after a successful Resend/SendGrid admin notify", () => {
  assert.equal(shouldSendVisitorAutoReply("sent"), true);
  assert.equal(shouldSendVisitorAutoReply("failed"), false);
  assert.equal(shouldSendVisitorAutoReply("logged"), false);
  assert.equal(shouldSendVisitorAutoReply("queued"), false);
});

test("auto-reply runs after admin sent and submit still succeeds if auto-reply throws", async () => {
  let autoReplies = 0;
  const ok = await afterPublicAdminNotify({
    adminStatus: "sent",
    sendAutoReply: async () => {
      autoReplies += 1;
      throw new Error("Resend 429: rate limited");
    },
    onAutoReplyError: () => undefined,
  });
  assert.deepEqual(ok, { ok: true });
  assert.equal(autoReplies, 1);
});

test("auto-reply is skipped when admin notify failed", async () => {
  let autoReplies = 0;
  await assert.rejects(
    () =>
      afterPublicAdminNotify({
        adminStatus: "failed",
        adminError: "Resend 403: domain not verified",
        sendAutoReply: async () => {
          autoReplies += 1;
        },
      }),
    /Resend 403/,
  );
  assert.equal(autoReplies, 0);
});

test("auto-reply is skipped when admin notify was only logged locally", async () => {
  let autoReplies = 0;
  const ok = await afterPublicAdminNotify({
    adminStatus: "logged",
    sendAutoReply: async () => {
      autoReplies += 1;
    },
  });
  assert.deepEqual(ok, { ok: true });
  assert.equal(autoReplies, 0);
});
