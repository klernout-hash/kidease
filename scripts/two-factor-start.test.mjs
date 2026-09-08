import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TWO_FACTOR_AUTO_COOLDOWN_MS,
  TWO_FACTOR_DEFAULT_MAIL_FROM,
  TWO_FACTOR_MAX_ATTEMPTS,
  decideTwoFactorStart,
  friendlyTwoFactorMailError,
  resendMessageId,
  twoFactorMailFrom,
} from "../src/lib/two-factor-start.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function liveChallenge(nowMs, extras = {}) {
  return {
    createdAtMs: nowMs - 5_000,
    expiresAtMs: nowMs + 9 * 60 * 1000,
    attempts: 0,
    ...extras,
  };
}

test("auto-start waits during the first-email cooldown so remounts do not remint", () => {
  const nowMs = 1_700_000_000_000;
  assert.equal(
    decideTwoFactorStart({ force: false, last: liveChallenge(nowMs), nowMs }),
    "wait",
  );
  assert.equal(
    decideTwoFactorStart({
      force: false,
      last: liveChallenge(nowMs, { createdAtMs: nowMs - (TWO_FACTOR_AUTO_COOLDOWN_MS - 1) }),
      nowMs,
    }),
    "wait",
  );
});

test("auto-start reuses an unexpired challenge after the cooldown", () => {
  const nowMs = 1_700_000_000_000;
  assert.equal(
    decideTwoFactorStart({
      force: false,
      last: liveChallenge(nowMs, { createdAtMs: nowMs - TWO_FACTOR_AUTO_COOLDOWN_MS }),
      nowMs,
    }),
    "reuse",
  );
});

test("auto-start mints when there is no live challenge", () => {
  const nowMs = 1_700_000_000_000;
  assert.equal(decideTwoFactorStart({ force: false, last: null, nowMs }), "mint");
  assert.equal(
    decideTwoFactorStart({
      force: false,
      last: liveChallenge(nowMs, {
        createdAtMs: nowMs - TWO_FACTOR_AUTO_COOLDOWN_MS,
        expiresAtMs: nowMs - 1,
      }),
      nowMs,
    }),
    "mint",
  );
  assert.equal(
    decideTwoFactorStart({
      force: false,
      last: liveChallenge(nowMs, {
        createdAtMs: nowMs - TWO_FACTOR_AUTO_COOLDOWN_MS,
        attempts: TWO_FACTOR_MAX_ATTEMPTS,
      }),
      nowMs,
    }),
    "mint",
  );
});

test("Send a new code mints even inside the auto-start cooldown", () => {
  const nowMs = 1_700_000_000_000;
  assert.equal(decideTwoFactorStart({ force: true, last: liveChallenge(nowMs), nowMs }), "mint");
  assert.equal(decideTwoFactorStart({ force: true, last: null, nowMs }), "mint");
});

test("mail failures stay generic and do not leak provider payloads", () => {
  assert.match(friendlyTwoFactorMailError(new Error("Email is not configured")), /not configured/);
  assert.match(
    friendlyTwoFactorMailError(new Error("Resend 429: {\"name\":\"rate_limit_exceeded\"}")),
    /could not send a new code/i,
  );
  assert.doesNotMatch(
    friendlyTwoFactorMailError(new Error("Resend 429: {\"name\":\"rate_limit_exceeded\"}")),
    /rate_limit_exceeded/,
  );
});

test("startTwoFactor sends before inserting so a failed resend keeps the previous code", () => {
  const twoFa = readFileSync(join(root, "src/lib/server/two-factor.ts"), "utf8");
  assert.match(twoFa, /decideTwoFactorStart/);
  assert.match(twoFa, /friendlyTwoFactorMailError/);
  const mintBlock = twoFa.slice(twoFa.indexOf("const code = String(randomInt"));
  const sendAt = mintBlock.indexOf("sendCodeEmail");
  const insertAt = mintBlock.indexOf("insert into login_challenges");
  assert.ok(sendAt > -1 && insertAt > -1, "mint path must send and insert");
  assert.ok(sendAt < insertAt, "email must be sent before the new challenge is persisted");
  assert.match(twoFa, /sent:\s*true as const/);
  assert.match(twoFa, /sent:\s*false as const/);
});

test("2FA From defaults to the Resend send subdomain, not Titan apex", () => {
  assert.equal(TWO_FACTOR_DEFAULT_MAIL_FROM, "KidEase <login@send.kidease.ca>");
  assert.equal(twoFactorMailFrom(""), TWO_FACTOR_DEFAULT_MAIL_FROM);
  assert.equal(twoFactorMailFrom("   "), TWO_FACTOR_DEFAULT_MAIL_FROM);
  assert.equal(twoFactorMailFrom("KidEase <alerts@send.kidease.ca>"), "KidEase <alerts@send.kidease.ca>");
  assert.equal(twoFactorMailFrom("KidEase <login@send.kidease.ca>"), "KidEase <login@send.kidease.ca>");
  assert.equal(twoFactorMailFrom("KidEase <kyle@kidease.ca>"), TWO_FACTOR_DEFAULT_MAIL_FROM);
  assert.equal(twoFactorMailFrom("kyle@kidease.ca"), TWO_FACTOR_DEFAULT_MAIL_FROM);
  assert.equal(twoFactorMailFrom("KidEase <support@kidease.ca>"), TWO_FACTOR_DEFAULT_MAIL_FROM);
  assert.match(TWO_FACTOR_DEFAULT_MAIL_FROM, /@send\.kidease\.ca>/);
  assert.doesNotMatch(TWO_FACTOR_DEFAULT_MAIL_FROM, /kyle@kidease\.ca/);
});

test("Resend message id is extracted without treating other payload fields as ids", () => {
  assert.equal(resendMessageId({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794");
  assert.equal(resendMessageId({ id: "  msg_123  " }), "msg_123");
  assert.equal(resendMessageId({ id: "" }), undefined);
  assert.equal(resendMessageId({ id: 12 }), undefined);
  assert.equal(resendMessageId({ object: "email" }), undefined);
  assert.equal(resendMessageId(null), undefined);
});

test("env example tells Production to set MAIL_FROM on send.kidease.ca and leave apex SPF Titan-only", () => {
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(envExample, /Production MUST set MAIL_FROM/);
  assert.match(envExample, /MAIL_FROM=KidEase <login@send\.kidease\.ca>/);
  assert.match(envExample, /Do NOT add Resend/);
  assert.doesNotMatch(envExample, /MAIL_FROM=KidEase <kyle@kidease\.ca>/);
});

test("sendCodeEmail uses aligned From, reply_to ADMIN_EMAIL, and logs Resend id", () => {
  const twoFa = readFileSync(join(root, "src/lib/server/two-factor.ts"), "utf8");
  const sendBlock = twoFa.slice(twoFa.indexOf("async function sendCodeEmail"), twoFa.indexOf("export const getTwoFactorStatus"));
  assert.match(sendBlock, /twoFactorMailFrom\(\)/);
  assert.match(sendBlock, /reply_to:\s*ADMIN_EMAIL/);
  assert.match(sendBlock, /reply_to:\s*\{\s*email:\s*ADMIN_EMAIL\s*\}/);
  assert.match(sendBlock, /\[kidease-2fa\] resend/);
  assert.match(sendBlock, /resendMessageId/);
  assert.doesNotMatch(sendBlock, /kyle@kidease\.ca/);
  assert.doesNotMatch(sendBlock, /re_[A-Za-z0-9]/);
});
