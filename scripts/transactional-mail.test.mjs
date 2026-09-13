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

test("OTP Resend From does not stay stuck on a missing send.kidease.ca host", () => {
  assert.equal(emergencyResendMailFrom({ MAIL_FROM: "KidEase <kyle@kidease.ca>" }), "KidEase <kyle@kidease.ca>");
  assert.equal(emergencyResendMailFrom({ MAIL_FROM_RESEND: "KidEase <kyle@kidease.ca>" }), "KidEase <kyle@kidease.ca>");
  assert.equal(emergencyResendMailFrom({ MAIL_FROM: "KidEase <noreply@send.kidease.ca>" }), null);
  const candidates = otpResendFromCandidates({ MAIL_FROM: "KidEase <noreply@send.kidease.ca>" });
  assert.equal(candidates[0], "KidEase <noreply@send.kidease.ca>");
  assert.ok(candidates.includes(EMERGENCY_RESEND_MAIL_FROM));
  const apexFirst = otpResendFromCandidates({ MAIL_FROM: "KidEase <kyle@kidease.ca>" });
  assert.equal(apexFirst[0], "KidEase <kyle@kidease.ca>");
  assert.equal(titanSmtpFrom(envBase()), "KidEase <kyle@kidease.ca>");
});

test("Resend 403 on send.kidease.ca retries apex From then Titan SMTP", async () => {
  resetOtpMailHealth();
  const froms = [];
  const logs = [];
  let titanTo = "";
  const fetchMock = async (_url, init) => {
    const body = JSON.parse(init.body);
    froms.push(body.from);
    assert.equal(body.reply_to, "kyle@kidease.ca");
    assert.doesNotMatch(JSON.stringify(init.headers), /re_live|re_test_secret/);
    return jsonResponse(403, { name: "validation_error", message: "domain send.kidease.ca is not verified" });
  };
  const result = await sendTransactionalMail(
    {
      purpose: "2fa",
      to: "kyle@kidease.ca",
      subject: "Your KidEase sign-in code",
      text: "code",
      html: "<p>code</p>",
      replyTo: "kyle@kidease.ca",
    },
    {
      fetch: fetchMock,
      sendTitan: async (input) => {
        titanTo = input.to;
        return { ok: true, via: "titan" };
      },
      env: envBase({
        RESEND_API_KEY: "re_test",
        TITAN_APP_PASSWORD: "not-a-real-password",
        MAIL_FROM: "KidEase <noreply@send.kidease.ca>",
      }),
      log: (line) => logs.push(line),
    },
  );
  assert.equal(result.status, "sent");
  assert.equal(result.via, "titan");
  assert.equal(result.fallbackFrom, "resend");
  assert.equal(titanTo, "kyle@kidease.ca");
  assert.ok(froms.includes("KidEase <noreply@send.kidease.ca>"));
  assert.ok(froms.includes(EMERGENCY_RESEND_MAIL_FROM));
  assert.ok(logs.some((line) => line.includes("event=resend_fail") && line.includes("reason=domain_unverified")));
  assert.ok(logs.some((line) => line.includes("event=titan_fallback_success")));
  assert.equal(logs.some((line) => /re_test|not-a-real-password|123456/.test(line)), false);
  const health = readOtpMailHealth();
  assert.equal(health.lastEvent, "titan_fallback_success");
  assert.equal(health.lastVia, "titan");
  assert.equal(health.lastReason, "domain_unverified");
  assert.equal(health.titanConfigured, true);
});

test("Resend apex retry can succeed after send subdomain 403 without Titan", async () => {
  resetOtpMailHealth();
  let n = 0;
  const result = await sendTransactionalMail(
    {
      purpose: "2fa",
      to: "kyle@kidease.ca",
      subject: "code",
      text: "code",
      html: "<p>code</p>",
    },
    {
      fetch: async (_url, init) => {
        n += 1;
        const body = JSON.parse(init.body);
        if (String(body.from).includes("send.kidease.ca")) {
          return jsonResponse(403, { message: "The send.kidease.ca domain is not verified" });
        }
        return jsonResponse(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
      },
      sendTitan: async () => {
        throw new Error("Titan should not run when Resend apex retry works");
      },
      env: envBase({
        RESEND_API_KEY: "re_test",
        MAIL_FROM: "KidEase <noreply@send.kidease.ca>",
      }),
      log: () => {},
    },
  );
  assert.equal(result.status, "sent");
  assert.equal(result.via, "resend");
  assert.equal(n, 2);
  assert.equal(readOtpMailHealth().lastEvent, "resend_retry_apex");
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

test("SendGrid is tried after Resend fail and before Titan", async () => {
  resetOtpMailHealth();
  const hosts = [];
  const result = await sendTransactionalMail(
    {
      purpose: "password_reset",
      to: "parent@example.com",
      subject: "reset",
      text: "link",
      html: "<p>link</p>",
    },
    {
      fetch: async (url) => {
        hosts.push(String(url));
        if (String(url).includes("resend.com")) return jsonResponse(403, { message: "domain is not verified" });
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
  assert.ok(hosts.some((url) => url.includes("resend.com")));
  assert.ok(hosts.some((url) => url.includes("sendgrid.com")));
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
});
