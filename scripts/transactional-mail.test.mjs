import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMERGENCY_RESEND_MAIL_FROM,
  classifyMailFailure,
  emergencyResendMailFrom,
  formatTransactionalMailLog,
  friendlyTransactionalMailError,
  otpResendFromCandidates,
  readOtpMailHealth,
  resetOtpMailHealth,
  sendTransactionalMail,
  shouldFallbackAfterResend,
  titanFallbackAllowed,
  titanSmtpFrom,
  transactionalMailConfigured,
} from "../src/lib/transactional-mail.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function mailHost(url) {
  return new URL(String(url)).hostname;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function envBase(extra = {}) {
  return {
    ADMIN_EMAIL: "kyle@kidease.ca",
    TITAN_USER: "kyle@kidease.ca",
    ...extra,
  };
}

test("Resend 403 unverified domain is classified and must fall back", () => {
  const reason = classifyMailFailure(403, '{"statusCode":403,"name":"validation_error","message":"The kidease.ca domain is not verified"}');
  assert.equal(classifyMailFailure(403, "send.kidease.ca domain is not verified"), "domain_unverified");
  assert.equal(reason, "domain_unverified");
  assert.equal(shouldFallbackAfterResend(reason), true);
  assert.equal(classifyMailFailure(403, "forbidden"), "forbidden");
  assert.equal(shouldFallbackAfterResend("forbidden"), true);
});

test("Titan fallback is allowed for kyle@ or when Resend is unhealthy", () => {
  const env = envBase({ TITAN_APP_PASSWORD: "not-a-real-password" });
  assert.equal(
    titanFallbackAllowed({ to: "kyle@kidease.ca", titanConfigured: true, resendUnhealthy: false, env }),
    true,
  );
  assert.equal(
    titanFallbackAllowed({ to: "parent@example.com", titanConfigured: true, resendUnhealthy: true, env }),
    true,
  );
  assert.equal(
    titanFallbackAllowed({ to: "parent@example.com", titanConfigured: true, resendUnhealthy: false, env }),
    false,
  );
  assert.equal(
    titanFallbackAllowed({ to: "kyle@kidease.ca", titanConfigured: false, resendUnhealthy: true, env }),
    false,
  );
});

test("OTP Resend From stays on noreply@send.kidease.ca, never the apex mailbox", () => {
  assert.equal(emergencyResendMailFrom({ MAIL_FROM: "KidEase <kyle@kidease.ca>" }), "KidEase <kyle@kidease.ca>");
  assert.equal(emergencyResendMailFrom({ MAIL_FROM_RESEND: "KidEase <kyle@kidease.ca>" }), "KidEase <kyle@kidease.ca>");
  assert.equal(emergencyResendMailFrom({ MAIL_FROM: "KidEase <noreply@send.kidease.ca>" }), null);
  const candidates = otpResendFromCandidates({ MAIL_FROM: "KidEase <noreply@send.kidease.ca>" });
  assert.deepEqual(candidates, ["KidEase <noreply@send.kidease.ca>"]);
  const apexFirst = otpResendFromCandidates({ MAIL_FROM: "KidEase <kyle@kidease.ca>" });
  assert.deepEqual(apexFirst, ["KidEase <noreply@send.kidease.ca>"]);
  assert.equal(candidates.includes(EMERGENCY_RESEND_MAIL_FROM), false);
  assert.equal(apexFirst.includes("KidEase <kyle@kidease.ca>"), false);
  assert.equal(titanSmtpFrom(envBase()), "KidEase <kyle@kidease.ca>");
});

test("sign-in codes use Titan SMTP first and do not call Resend when Titan accepts", async () => {
  resetOtpMailHealth();
  const logs = [];
  let titanCalls = 0;
  let resendCalls = 0;
  const result = await sendTransactionalMail(
    {
      purpose: "2fa",
      to: "parent@example.com",
      subject: "Your KidEase sign-in code",
      text: "123456",
      html: "<p>123456</p>",
      replyTo: "kyle@kidease.ca",
    },
    {
      fetch: async () => {
        resendCalls += 1;
        return jsonResponse(200, { id: "should-not-send" });
      },
      sendTitan: async (input) => {
        titanCalls += 1;
        assert.equal(input.to, "parent@example.com");
        assert.equal(input.subject, "Your KidEase sign-in code");
        return { ok: true, via: "titan" };
      },
      env: envBase({
        RESEND_API_KEY: "re_test",
        SENDGRID_API_KEY: "sg_test",
        TITAN_APP_PASSWORD: "not-a-real-password",
        MAIL_FROM: "KidEase <noreply@send.kidease.ca>",
      }),
      log: (line) => logs.push(line),
    },
  );
  assert.equal(titanSmtpFrom(envBase()), "KidEase <kyle@kidease.ca>");
  assert.equal(titanCalls, 1);
  assert.equal(resendCalls, 0);
  assert.equal(result.status, "sent");
  assert.equal(result.via, "titan");
  assert.equal(result.fallbackFrom, undefined);
  assert.ok(logs.some((line) => line.includes("event=titan_ok") && line.includes("via=titan")));
  assert.equal(logs.some((line) => /re_test|sg_test|not-a-real-password|123456/.test(line)), false);
  assert.equal(readOtpMailHealth().lastVia, "titan");
});

test("a Titan error falls back to Resend and then SendGrid", async () => {
  resetOtpMailHealth();
  const order = [];
  const logs = [];
  const result = await sendTransactionalMail(
    {
      purpose: "2fa",
      to: "staff@example.com",
      subject: "Your KidEase sign-in code",
      text: "654321",
      html: "<p>654321</p>",
    },
    {
      fetch: async (url) => {
        order.push(String(url));
        if (mailHost(url) === "api.resend.com") return jsonResponse(403, { message: "domain is not verified" });
        return jsonResponse(202, "");
      },
      sendTitan: async () => {
        order.push("titan");
        throw new Error("Titan SMTP AUTH failed");
      },
      env: envBase({
        RESEND_API_KEY: "re_test",
        SENDGRID_API_KEY: "sg_test",
        TITAN_APP_PASSWORD: "not-a-real-password",
      }),
      log: (line) => logs.push(line),
    },
  );
  assert.deepEqual(order, ["titan", "https://api.resend.com/emails", "https://api.sendgrid.com/v3/mail/send"]);
  assert.equal(result.status, "sent");
  assert.equal(result.via, "sendgrid");
  assert.equal(result.fallbackFrom, "titan");
  assert.ok(logs.some((line) => line.includes("event=titan_fail") && line.includes("via=titan")));
  assert.ok(logs.some((line) => line.includes("event=sendgrid_ok") && line.includes("via=sendgrid")));
  assert.equal(logs.some((line) => /not-a-real-password|654321|re_test|sg_test/.test(line)), false);
});

test("an empty Titan password skips Titan and uses Resend", async () => {
  resetOtpMailHealth();
  let titanCalls = 0;
  const froms = [];
  const result = await sendTransactionalMail(
    {
      purpose: "verify_email",
      to: "parent@example.com",
      subject: "code",
      text: "code",
      html: "<p>code</p>",
    },
    {
      fetch: async (_url, init) => {
        froms.push(JSON.parse(init.body).from);
        return jsonResponse(200, { id: "resend-id" });
      },
      sendTitan: async () => {
        titanCalls += 1;
        throw new Error("Titan should not run without a password");
      },
      env: envBase({
        RESEND_API_KEY: "re_test",
        TITAN_APP_PASSWORD: "   ",
        MAIL_FROM: "KidEase <kyle@kidease.ca>",
      }),
      log: () => {},
    },
  );
  assert.equal(titanCalls, 0);
  assert.equal(result.via, "resend");
  assert.deepEqual(froms, ["KidEase <noreply@send.kidease.ca>"]);
});

test("a rejected send.kidease.ca From is not retried as the apex mailbox", async () => {
  resetOtpMailHealth();
  let n = 0;
  const froms = [];
  await assert.rejects(
    () =>
      sendTransactionalMail(
        {
          purpose: "2fa",
          to: "parent@example.com",
          subject: "code",
          text: "code",
          html: "<p>code</p>",
        },
        {
          fetch: async (_url, init) => {
            n += 1;
            const body = JSON.parse(init.body);
            froms.push(body.from);
            return jsonResponse(403, { message: "The send.kidease.ca domain is not verified" });
          },
          env: envBase({
            RESEND_API_KEY: "re_test",
            MAIL_FROM: "KidEase <kyle@kidease.ca>",
          }),
          log: () => {},
        },
      ),
    /could not be sent/i,
  );
  assert.equal(n, 1);
  assert.deepEqual(froms, ["KidEase <noreply@send.kidease.ca>"]);
});

test("all providers failing throws and never reports sent", async () => {
  resetOtpMailHealth();
  await assert.rejects(
    () =>
      sendTransactionalMail(
        {
          purpose: "2fa",
          to: "kyle@kidease.ca",
          subject: "code",
          text: "code",
          html: "<p>code</p>",
        },
        {
          fetch: async () => jsonResponse(403, { message: "domain is not verified" }),
          sendTitan: async () => {
            throw new Error("Titan SMTP AUTH failed");
          },
          env: envBase({
            RESEND_API_KEY: "re_test",
            TITAN_APP_PASSWORD: "not-a-real-password",
          }),
          log: () => {},
        },
      ),
    /could not be sent/i,
  );
  assert.equal(readOtpMailHealth().lastEvent, "all_failed");
});

test("non-code mail still tries SendGrid after Resend and before Titan", async () => {
  resetOtpMailHealth();
  const hosts = [];
  const result = await sendTransactionalMail(
    {
      purpose: "claim",
      to: "parent@example.com",
      subject: "reset",
      text: "link",
      html: "<p>link</p>",
    },
    {
      fetch: async (url) => {
        hosts.push(String(url));
        if (mailHost(url) === "api.resend.com") return jsonResponse(403, { message: "domain is not verified" });
        return jsonResponse(202, "");
      },
      sendTitan: async () => {
        throw new Error("Titan should wait behind SendGrid");
      },
      env: envBase({
        RESEND_API_KEY: "re_test",
        SENDGRID_API_KEY: "sg_test",
        TITAN_APP_PASSWORD: "not-a-real-password",
      }),
      log: () => {},
    },
  );
  assert.equal(result.status, "sent");
  assert.equal(result.via, "sendgrid");
  assert.ok(hosts.some((url) => mailHost(url) === "api.resend.com"));
  assert.ok(hosts.some((url) => mailHost(url) === "api.sendgrid.com"));
});

test("Titan counts as configured for OTP / reset and logs stay secret-free", () => {
  assert.equal(transactionalMailConfigured({}), false);
  assert.equal(transactionalMailConfigured({ TITAN_APP_PASSWORD: "not-a-real-password" }), true);
  assert.equal(transactionalMailConfigured({ RESEND_API_KEY: "re_test" }), true);
  const line = formatTransactionalMailLog({
    purpose: "2fa",
    event: "titan_fallback_success",
    via: "titan",
    reason: "domain_unverified",
    status: 403,
  });
  assert.match(line, /\[kidease-mail\] purpose=2fa event=titan_fallback_success via=titan reason=domain_unverified status=403/);
  assert.doesNotMatch(line, /re_|sg_|password|@/);
  assert.match(friendlyTransactionalMailError(new Error("Email is not configured"), "otp"), /not configured/);
  assert.match(friendlyTransactionalMailError(new Error("could not send"), "otp"), /support@kidease\.ca/);
  assert.match(friendlyTransactionalMailError(new Error("could not send"), "otp"), /did not treat this as sent/);
});

test("2FA and reset paths use the shared fallback sender", () => {
  const twoFa = readFileSync(join(root, "src/lib/server/two-factor.ts"), "utf8");
  const reset = readFileSync(join(root, "src/lib/server/reset-mail.ts"), "utf8");
  const claim = readFileSync(join(root, "src/lib/server/claim-mail.ts"), "utf8");
  assert.match(twoFa, /sendTransactionalMail/);
  assert.match(twoFa, /purpose:\s*"2fa"/);
  assert.match(twoFa, /replyTo:\s*ADMIN_EMAIL/);
  assert.match(reset, /sendTransactionalMail/);
  assert.match(reset, /purpose:\s*"password_reset"/);
  assert.match(claim, /sendTransactionalMail/);
  assert.match(claim, /purpose:\s*"claim"/);
  const verify = readFileSync(join(root, "src/lib/server/verify-mail.ts"), "utf8");
  const onboard = readFileSync(join(root, "src/lib/server/provider-onboard-mail.ts"), "utf8");
  assert.match(verify, /purpose:\s*"verify_email"/);
  assert.match(onboard, /purpose:\s*"provider_onboard"/);
});
