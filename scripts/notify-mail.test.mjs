import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterEnrollmentAdminNotify,
  afterPublicAdminNotify,
  actorConfirmationReplyTo,
  actorConfirmationText,
  ACTOR_CONFIRM_KINDS,
  ACTOR_CONFIRM_SUBJECT,
  isActorConfirmKind,
  publicNotifyOk,
  publicSubmitResult,
  resolveMailReplyTo,
  sendMailThenPersist,
  shouldSendActorConfirmation,
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

test("auto-reply is invoked before the submit handler returns (same request, not scheduled)", async () => {
  const order = [];
  const done = afterPublicAdminNotify({
    adminStatus: "sent",
    sendAutoReply: async () => {
      order.push("auto-reply");
    },
  });
  const ok = await done;
  assert.deepEqual(order, ["auto-reply"]);
  assert.deepEqual(ok, { ok: true });
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

test("actor confirmation kinds are signup, enroll, claim, spot, and tour request", () => {
  for (const kind of ["account", "signup", "enroll", "listing", "claim", "spot_request", "tour_request"]) {
    assert.equal(isActorConfirmKind(kind), true);
    assert.equal(shouldSendActorConfirmation(kind, "sent", "parent@example.com"), true);
  }
  assert.deepEqual(
    [...ACTOR_CONFIRM_KINDS],
    ["account", "signup", "enroll", "listing", "claim", "spot_request", "tour_request"],
  );
});

test("actor confirmation is not sent for contact, support, payment, or promo", () => {
  for (const kind of ["contact", "support", "payment", "promo"]) {
    assert.equal(isActorConfirmKind(kind), false);
    assert.equal(shouldSendActorConfirmation(kind, "sent", "parent@example.com"), false);
  }
});

test("actor confirmation is skipped when admin notify failed or was only logged", () => {
  assert.equal(shouldSendActorConfirmation("account", "failed", "parent@example.com"), false);
  assert.equal(shouldSendActorConfirmation("spot_request", "logged", "parent@example.com"), false);
  assert.equal(shouldSendActorConfirmation("claim", "queued", "parent@example.com"), false);
});

test("actor confirmation is skipped when there is no actor email", () => {
  assert.equal(shouldSendActorConfirmation("account", "sent", null), false);
  assert.equal(shouldSendActorConfirmation("account", "sent", ""), false);
  assert.equal(shouldSendActorConfirmation("account", "sent", "   "), false);
});

test("confirmation copy keeps the 24-hour promise and Thank you, and does not invent spots or fees", () => {
  assert.equal(ACTOR_CONFIRM_SUBJECT, "We got your request — KidEase");
  for (const kind of ACTOR_CONFIRM_KINDS) {
    const text = actorConfirmationText(kind);
    assert.match(text, /within 24 hours/);
    assert.match(text, /Thank you$/);
    assert.doesNotMatch(text, /\$|fee|spot is held|open spots|deposit/i);
  }
  assert.match(actorConfirmationText("account"), /signing up with KidEase/);
  assert.match(actorConfirmationText("signup"), /signing up as a provider/);
  assert.match(actorConfirmationText("enroll"), /enrolment/);
  assert.match(actorConfirmationText("listing"), /daycare listing/);
  assert.match(actorConfirmationText("claim"), /listing claim/);
  assert.match(actorConfirmationText("spot_request"), /spot request/);
  assert.match(actorConfirmationText("tour_request"), /tour request/);
});

test("confirmation reply_to is Kyle, not the parent or provider", () => {
  assert.equal(actorConfirmationReplyTo("kyle@kidease.ca"), "kyle@kidease.ca");
  assert.equal(actorConfirmationReplyTo("  kyle@kidease.ca  "), "kyle@kidease.ca");
  assert.notEqual(actorConfirmationReplyTo("kyle@kidease.ca"), "parent@example.com");
});

test("confirmation runs after admin sent and signup still succeeds if confirmation throws", async () => {
  let confirms = 0;
  await afterEnrollmentAdminNotify({
    kind: "account",
    adminStatus: "sent",
    actorEmail: "parent@example.com",
    sendConfirmation: async () => {
      confirms += 1;
      throw new Error("Resend 429: rate limited");
    },
    onConfirmationError: () => undefined,
  });
  assert.equal(confirms, 1);
});

test("confirmation is skipped when admin notify failed — user action still succeeds", async () => {
  let confirms = 0;
  await afterEnrollmentAdminNotify({
    kind: "spot_request",
    adminStatus: "failed",
    actorEmail: "parent@example.com",
    sendConfirmation: async () => {
      confirms += 1;
    },
  });
  assert.equal(confirms, 0);
});

test("confirmation is invoked before the enroll handler returns (same request, not scheduled)", async () => {
  const order = [];
  const done = afterEnrollmentAdminNotify({
    kind: "claim",
    adminStatus: "sent",
    actorEmail: "provider@example.com",
    sendConfirmation: async () => {
      order.push("confirm");
    },
  });
  await done;
  assert.deepEqual(order, ["confirm"]);
});
