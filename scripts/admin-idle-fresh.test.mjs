import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isAdminIdleWindowFresh, isWithinAdminIdleTtl } from "../src/lib/admin-idle.ts";
import { isSessionCookieSignature, unsignedSessionToken } from "../src/lib/auth/cookies.ts";
import { ADMIN_IDLE_TTL_MS } from "../src/lib/reauth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("unsignedSessionToken", () => {
  it("strips Better Auth base64urlnopad HMAC (production 1.7 setSignedCookie)", () => {
    const token = "sess_live_abc123XYZ";
    const sig = createHmac("sha256", "better-auth-secret").update(token).digest("base64url");
    assert.equal(sig.length, 43);
    assert.equal(sig.includes("="), false);
    assert.equal(isSessionCookieSignature(sig), true);
    assert.equal(unsignedSessionToken(`${token}.${sig}`), token);
    assert.equal(unsignedSessionToken(encodeURIComponent(`${token}.${sig}`)), token);
  });

  it("still strips padded base64 and hex HMAC suffixes", () => {
    const token = "sess_live_abc123XYZ";
    const padded = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const hex = "a".repeat(64);
    assert.equal(padded.length, 44);
    assert.equal(unsignedSessionToken(`${token}.${padded}`), token);
    assert.equal(unsignedSessionToken(`${token}.${hex}`), token);
  });

  it("leaves unsigned tokens, bearers, and short dotted values unchanged", () => {
    const token = "sess_live_abc123XYZ";
    assert.equal(unsignedSessionToken(token), token);
    assert.equal(unsignedSessionToken(null), null);
    assert.equal(unsignedSessionToken(""), null);
    assert.equal(unsignedSessionToken("a.b"), "a.b");
    assert.equal(isSessionCookieSignature("a.b"), false);
    assert.equal(isSessionCookieSignature("short"), false);
  });
});

describe("admin idle freshness window", () => {
  const nowMs = Date.parse("2026-09-17T04:24:00.000Z");
  const ttlMs = ADMIN_IDLE_TTL_MS;

  it("treats a present idle cookie as fresh and slides last-seen / createdAt", () => {
    assert.equal(
      isAdminIdleWindowFresh({
        idleCookiePresent: true,
        sessionCreatedAtMs: nowMs - 2 * ttlMs,
        lastSeenAtMs: nowMs - 2 * ttlMs,
        nowMs,
        ttlMs,
      }),
      true,
    );
  });

  it("keeps a session fresh from last-seen after createdAt is older than TTL", () => {
    assert.equal(
      isAdminIdleWindowFresh({
        idleCookiePresent: false,
        sessionCreatedAtMs: nowMs - 45 * 60 * 1000,
        lastSeenAtMs: nowMs - 5 * 60 * 1000,
        nowMs,
        ttlMs,
      }),
      true,
    );
  });

  it("bootstraps a brand-new session when the idle cookie is missing", () => {
    assert.equal(
      isAdminIdleWindowFresh({
        idleCookiePresent: false,
        sessionCreatedAtMs: nowMs - 2 * 60 * 1000,
        lastSeenAtMs: null,
        nowMs,
        ttlMs,
      }),
      true,
    );
    assert.equal(isWithinAdminIdleTtl(nowMs + 30_000, nowMs, ttlMs), true);
  });

  it("is stale when cookie, last-seen, and createdAt are all outside the window", () => {
    assert.equal(
      isAdminIdleWindowFresh({
        idleCookiePresent: false,
        sessionCreatedAtMs: nowMs - 45 * 60 * 1000,
        lastSeenAtMs: nowMs - 31 * 60 * 1000,
        nowMs,
        ttlMs,
      }),
      false,
    );
    assert.equal(
      isAdminIdleWindowFresh({
        idleCookiePresent: false,
        sessionCreatedAtMs: null,
        lastSeenAtMs: null,
        nowMs,
        ttlMs,
      }),
      false,
    );
  });
});

describe("assertAdminIdleFresh bootstrap", () => {
  it("uses verified session token/createdAt and per-session last-seen", () => {
    const reauth = src("src/lib/server/reauth.server.ts");
    assert.match(reauth, /bootstrapAdminIdleFromSession/);
    assert.match(reauth, /getVerifiedAuthSession/);
    assert.match(reauth, /admin_idle_seen/);
    assert.match(reauth, /isAdminIdleWindowFresh/);
    assert.match(reauth, /maxAge/);
    assert.match(src("src/lib/auth/server.ts"), /unsignedSessionToken/);
    assert.match(src("src/lib/auth/cookies.ts"), /sig\.length === 43/);
    assert.match(src("src/lib/reauth.ts"), /ADMIN_IDLE_TTL_MS = 30 \* 60 \* 1000/);
    assert.match(src("migrations/0056_admin_idle_seen.sql"), /admin_idle_seen/);
  });

  it("mints idle cookie on 2FA / reauth step-up, not only requireAdmin", () => {
    assert.match(src("src/lib/server/two-factor.ts"), /markAdminIdleFresh/);
    assert.match(src("src/lib/server/reauth.ts"), /markAdminIdleFresh/);
    assert.match(src("src/lib/server/reauth.ts"), /canContinueAdminSession/);
    assert.match(src("src/lib/server/roles.ts"), /bootstrapAdminIdleFromSession/);
  });

  it("blocks soft session-continue into Admin when idle is stale", () => {
    const login = src("src/routes/login.tsx");
    const stall = src("src/lib/auth/login-stall.ts");
    assert.match(login, /canContinueAdminSession/);
    assert.match(stall, /Admin session timed out\. Enter your password/);
    assert.match(login, /releaseStuckLogin\("admin-password"\)/);
    assert.match(login, /user \|\| operator/);
    assert.doesNotMatch(login, /continued\.current = false/);
  });
});
