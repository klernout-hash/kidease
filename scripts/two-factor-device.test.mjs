import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  expireAuthCookieHeaders,
  SHARED_TWO_FACTOR_COOKIE,
  SHARED_TWO_FACTOR_DEVICE_COOKIE,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_DEVICE_COOKIE,
  shareOutboundAuthCookies,
} from "../src/lib/auth/cookies.ts";
import {
  isTwoFactorVerified,
  isTwoFactorVerifiedAny,
  parseTwoFactorDevice,
  signTwoFactorCookie,
  TWO_FACTOR_DEVICE_TTL_MS,
} from "../src/lib/two-factor-cookie.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("2FA cookie verify fails closed on missing, tampered, expired, or wrong user", () => {
  const secret = "test-secret";
  const exp = Date.now() + 60_000;
  const raw = signTwoFactorCookie("kyle-1", exp, secret);
  assert.equal(isTwoFactorVerified("kyle-1", raw, secret), true);
  assert.equal(isTwoFactorVerified("other", raw, secret), false);
  assert.equal(isTwoFactorVerified("kyle-1", null, secret), false);
  assert.equal(isTwoFactorVerified("kyle-1", raw, ""), false);
  assert.equal(isTwoFactorVerified("kyle-1", `${raw}x`, secret), false);
  assert.equal(isTwoFactorVerified("kyle-1", "not.a.cookie", secret), false);
  const expired = signTwoFactorCookie("kyle-1", Date.now() - 1, secret);
  assert.equal(isTwoFactorVerified("kyle-1", expired, secret), false);
  assert.equal(parseTwoFactorDevice(raw, secret)?.userId, "kyle-1");
});

test("any valid session or trusted-device cookie verifies; tampered siblings do not block a good one", () => {
  const secret = "test-secret";
  const device = signTwoFactorCookie("kyle-1", Date.now() + TWO_FACTOR_DEVICE_TTL_MS, secret);
  assert.equal(isTwoFactorVerifiedAny("kyle-1", [null, "tampered", device], secret), true);
  assert.equal(isTwoFactorVerifiedAny("kyle-1", [null, "tampered"], secret), false);
  assert.equal(isTwoFactorVerifiedAny("other", [device], secret), false);
});

test("trusted-device cookies are shared across apex/www and are not expired on sign-out", () => {
  const hostCookie = `${TWO_FACTOR_DEVICE_COOKIE}=abc; Path=/; Secure; HttpOnly; SameSite=Lax`;
  const shared = shareOutboundAuthCookies([hostCookie]);
  assert.equal(shared.length, 1);
  assert.match(shared[0], new RegExp(`^${SHARED_TWO_FACTOR_DEVICE_COOKIE}=`));
  assert.match(shared[0], /Domain=kidease\.ca/i);

  const expired = expireAuthCookieHeaders(true);
  assert.ok(expired.some((c) => c.startsWith(`${TWO_FACTOR_COOKIE}=`)));
  assert.ok(expired.some((c) => c.startsWith(`${SHARED_TWO_FACTOR_COOKIE}=`)));
  assert.ok(!expired.some((c) => c.includes(TWO_FACTOR_DEVICE_COOKIE)));
  assert.ok(!expired.some((c) => c.includes(SHARED_TWO_FACTOR_DEVICE_COOKIE)));
});

test("verify writes a session cookie always and a 30-day device cookie only when remember is checked", () => {
  const twoFa = src("src/lib/server/two-factor.ts");
  const server = src("src/lib/server/two-factor.server.ts");
  assert.match(twoFa, /writeTwoFactorSessionCookie\(context\.userId\)/);
  assert.match(twoFa, /if \(data\.remember\) writeTwoFactorDeviceCookie\(context\.userId, TWO_FACTOR_DEVICE_TTL_MS\)/);
  assert.match(server, /TWO_FACTOR_DEVICE_COOKIE/);
  assert.match(server, /SHARED_TWO_FACTOR_DEVICE_COOKIE/);
  assert.match(server, /writeTwoFactorSessionCookie/);
  assert.doesNotMatch(server, /writePair\(\s*TWO_FACTOR_COOKIE,\s*SHARED_TWO_FACTOR_COOKIE,\s*signTwoFactorCookie\(userId, exp, secret\(\)\),\s*expires/);
});
