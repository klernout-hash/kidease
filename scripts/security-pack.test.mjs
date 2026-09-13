import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTH_FORGOT_MAX,
  AUTH_LOGIN_MAX,
  AUTH_SIGNUP_MAX,
  parseRetryAfterSeconds,
  rateLimitWaitCopy,
  TWO_FACTOR_HOURLY_MAX,
} from "../src/lib/auth-rate-limit.ts";
import {
  isCommonPassword,
  localPasswordIssue,
  PASSWORD_BREACHED_MESSAGE,
  PASSWORD_COMMON_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT,
  passwordMeetsPolicy,
} from "../src/lib/password-hygiene.ts";
import {
  ADMIN_IDLE_TTL_MS,
  isRecentReauth,
  isReauthRequiredMessage,
  parseReauthCookie,
  REAUTH_REQUIRED_MESSAGE,
  REAUTH_WINDOW_MS,
  signReauthCookie,
} from "../src/lib/reauth.ts";
import {
  isTwoFactorVerified,
  parseTwoFactorDevice,
  signTwoFactorCookie,
  signTwoFactorDeviceCookie,
  TWO_FACTOR_DEVICE_TTL_MS,
} from "../src/lib/two-factor-cookie.ts";
import { twoFactorHourlyWait, TWO_FACTOR_RESEND_COOLDOWN_MS } from "../src/lib/two-factor-start.ts";
import { deviceLabelFromUserAgent } from "../src/lib/trusted-device.ts";
import {
  ADMIN_IDLE_COOKIE,
  expireAuthCookieHeaders,
  expireTrustedDeviceCookieHeaders,
  REAUTH_COOKIE,
  SESSION_TOKEN_COOKIE,
  SHARED_TWO_FACTOR_DEVICE_COOKIE,
  TWO_FACTOR_DEVICE_COOKIE,
} from "../src/lib/auth/cookies.ts";
import { KIDEASE_OPERATOR_EMAIL } from "../src/lib/admin-email.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("1) trusted devices + session list", () => {
  it("lists devices on Parent, Daycare, and Admin account settings", () => {
    const account = src("src/routes/account.tsx");
    assert.match(account, /SignedInDevices/);
    assert.match(account, /AccountSecurity/);
    assert.match(src("src/components/signed-in-devices.tsx"), /Devices signed in/);
    assert.match(src("src/components/signed-in-devices.tsx"), /Revoke this device/);
    assert.match(src("src/components/signed-in-devices.tsx"), /Revoke all other devices/);
    assert.match(src("src/lib/server/trusted-devices.ts"), /fail closed|Could not revoke/);
    assert.match(src("src/lib/server/trusted-devices.ts"), /delete from "session"/);
    assert.match(src("src/lib/server/trusted-devices.ts"), /trusted_devices/);
  });

  it("extends #187 4-part device cookies without breaking 3-part remember-30d", () => {
    const secret = "test-secret";
    const exp = Date.now() + TWO_FACTOR_DEVICE_TTL_MS;
    const legacy = signTwoFactorCookie("kyle-1", exp, secret);
    assert.equal(isTwoFactorVerified("kyle-1", legacy, secret), true);
    assert.equal(parseTwoFactorDevice(legacy, secret)?.deviceId, undefined);
    const next = signTwoFactorDeviceCookie("kyle-1", "dev_abc", exp, secret);
    const parsed = parseTwoFactorDevice(next, secret);
    assert.equal(parsed?.userId, "kyle-1");
    assert.equal(parsed?.deviceId, "dev_abc");
    assert.equal(isTwoFactorVerified("kyle-1", next, secret), true);
    assert.equal(isTwoFactorVerified("other", next, secret), false);
    const twoFa = src("src/lib/server/two-factor.ts");
    assert.match(twoFa, /writeTwoFactorDeviceCookie\(context\.userId, TWO_FACTOR_DEVICE_TTL_MS\)/);
    assert.match(twoFa, /persistTrustedDevice/);
    assert.match(src("src/lib/server/two-factor.server.ts"), /signTwoFactorDeviceCookie/);
  });

  it("sign-out still leaves trusted-device cookies; revoke-this expires them", () => {
    const expired = expireAuthCookieHeaders(true);
    assert.ok(!expired.some((c) => c.includes(TWO_FACTOR_DEVICE_COOKIE)));
    assert.ok(!expired.some((c) => c.includes(SHARED_TWO_FACTOR_DEVICE_COOKIE)));
    const device = expireTrustedDeviceCookieHeaders(true);
    assert.ok(device.some((c) => c.startsWith(`${TWO_FACTOR_DEVICE_COOKIE}=`)));
    assert.ok(device.some((c) => c.startsWith(`${SHARED_TWO_FACTOR_DEVICE_COOKIE}=`)));
  });
});

describe("2) step-up auth", () => {
  it("uses a 10-minute reauth window and gates sensitive actions", () => {
    assert.equal(REAUTH_WINDOW_MS, 10 * 60 * 1000);
    const secret = "test-secret";
    const raw = signReauthCookie("kyle-1", Date.now() + REAUTH_WINDOW_MS, secret);
    assert.equal(isRecentReauth("kyle-1", raw, secret), true);
    assert.equal(isRecentReauth("other", raw, secret), false);
    assert.equal(isRecentReauth("kyle-1", signReauthCookie("kyle-1", Date.now() - 1, secret), secret), false);
    assert.equal(parseReauthCookie(`${raw}x`, secret), null);
    assert.equal(isReauthRequiredMessage(REAUTH_REQUIRED_MESSAGE), true);
    const centres = src("src/lib/server/admin-centres.ts");
    const contracts = src("src/lib/server/contracts.ts");
    const account = src("src/lib/server/account-security.ts");
    assert.match(centres, /assertRecentReauth/);
    assert.match(contracts, /assertRecentReauth/);
    assert.match(account, /changeAccountPassword/);
    assert.match(account, /changeAccountEmail/);
    assert.match(src("src/routes/admin.tsx"), /withReauth/);
    assert.match(src("src/components/admin-contracts.tsx"), /withReauth/);
  });
});

describe("3) password hygiene", () => {
  it("blocks short, common, and weak passwords with honest copy", () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8);
    assert.equal(localPasswordIssue("short"), PASSWORD_TOO_SHORT);
    assert.equal(isCommonPassword("password123"), true);
    assert.equal(localPasswordIssue("password123"), PASSWORD_COMMON_MESSAGE);
    assert.equal(isCommonPassword("kidease1", "parent@example.com"), true);
    assert.equal(passwordMeetsPolicy("GoodPass1!"), true);
    assert.match(PASSWORD_BREACHED_MESSAGE, /breach/);
    assert.match(src("src/lib/server/password-hygiene.ts"), /api\.pwnedpasswords\.com\/range/);
    assert.match(src("src/lib/server/password-hygiene.ts"), /Add-Padding/);
    assert.match(src("src/routes/api/auth/$.ts"), /assertPasswordAllowed/);
    assert.match(src("src/routes/login.tsx"), /localPasswordIssue/);
    assert.match(src("src/routes/login.tsx"), /PasswordRules/);
    assert.match(src("src/routes/reset-password.tsx"), /localPasswordIssue/);
  });
});

describe("4) rate limits", () => {
  it("keeps soft caps and never silent-fails", () => {
    assert.equal(AUTH_LOGIN_MAX, 30);
    assert.equal(AUTH_SIGNUP_MAX, 15);
    assert.equal(AUTH_FORGOT_MAX, 8);
    assert.equal(TWO_FACTOR_RESEND_COOLDOWN_MS, 15_000);
    assert.equal(TWO_FACTOR_HOURLY_MAX, 20);
    assert.equal(parseRetryAfterSeconds("15"), 15);
    assert.match(rateLimitWaitCopy(15), /15s/);
    assert.match(rateLimitWaitCopy(60), /1 min/);
    const hourly = twoFactorHourlyWait({
      sentInWindow: TWO_FACTOR_HOURLY_MAX,
      oldestMs: Date.now() - 5 * 60 * 1000,
      nowMs: Date.now(),
    });
    assert.equal(hourly.blocked, true);
    assert.match(hourly.copy, /min/);
    assert.match(src("src/routes/api/auth/$.ts"), /applyHonestRateLimit/);
    assert.match(src("src/routes/api/auth/$.ts"), /RATE_LIMITED/);
    assert.match(src("src/lib/auth/client.ts"), /retry-after/);
    assert.doesNotMatch(src("src/routes/login.tsx"), /turnstile.*retry|retry.*turnstile/i);
    assert.match(src("src/lib/server/two-factor.ts"), /twoFactorHourlyWait/);
  });
});

describe("5) cookie / CSRF harden", () => {
  it("keeps Secure + HttpOnly + SameSite, shorter admin idle, kyle-only admin", () => {
    const server = src("src/lib/auth/server.ts");
    assert.match(server, /secure: true/);
    assert.match(server, /sameSite: "lax"/);
    assert.match(server, /httpOnly: true/);
    assert.match(server, /betterAuth\(/);
    assert.equal(ADMIN_IDLE_TTL_MS, 30 * 60 * 1000);
    assert.ok(ADMIN_IDLE_TTL_MS < TWO_FACTOR_DEVICE_TTL_MS);
    assert.match(src("src/lib/server/roles.ts"), /assertAdminIdleFresh/);
    assert.match(src("src/lib/server/admin-idle.ts"), /ADMIN_IDLE_TTL_MS/);
    const expired = expireAuthCookieHeaders(true);
    assert.ok(expired.some((c) => c.startsWith(`${REAUTH_COOKIE}=`) && /Secure; HttpOnly; SameSite=Lax/i.test(c)));
    assert.ok(expired.some((c) => c.startsWith(`${ADMIN_IDLE_COOKIE}=`)));
    assert.ok(expired.some((c) => c.startsWith(`${SESSION_TOKEN_COOKIE}=`) && /HttpOnly/i.test(c)));
    assert.equal(KIDEASE_OPERATOR_EMAIL, "kyle@kidease.ca");
    assert.match(src("src/lib/server/account-security.ts"), /isKidEaseOperatorEmail/);
    assert.match(src("src/lib/server/account-security.ts"), /operator mailbox stays/);
    assert.doesNotMatch(src("src/lib/server/password-hygiene.ts"), /HIBP_API_KEY|hibp.*secret/i);
    assert.doesNotMatch(src("src/lib/auth/server.ts"), /BETTER_AUTH_SECRET:\s*["'][^"']+["']/);
  });
});

describe("device label", () => {
  it("names common browsers without dumping the raw UA", () => {
    assert.match(deviceLabelFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0"), /Chrome on macOS/);
    assert.equal(deviceLabelFromUserAgent(""), "This browser");
  });
});
