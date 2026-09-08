import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TWO_FACTOR_AUTO_COOLDOWN_MS,
  TWO_FACTOR_MAX_ATTEMPTS,
  decideTwoFactorStart,
  friendlyTwoFactorMailError,
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
