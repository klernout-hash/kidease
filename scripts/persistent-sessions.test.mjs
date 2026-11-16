import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { isSessionCookieSignature } from "../src/lib/auth/cookies.ts";
import {
  PERSISTENT_SESSIONS_FLAG,
  WEB_REMEMBER_SEC,
  WEB_IDLE_MS,
  REFRESH_REUSE_GRACE_MS,
  cookieMaxAgeSec,
  decideRefresh,
  enrollAllowed,
  formatRefreshToken,
  initialSessionWindow,
  keepMeLabel,
  nextSessionWindow,
  parseRefreshToken,
  persistentSessionsEnabled,
  pickupListChanged,
  pushActionFor,
  requestIsAppShell,
  revokePlan,
  sessionVisibleTo,
  sha256Hex,
  showKeepMeSignedIn,
  signSessionToken,
  stepUpRequired,
} from "../src/lib/persistent-session.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("persistent sessions stay off until the env flag is on", () => {
  assert.equal(PERSISTENT_SESSIONS_FLAG, "FEATURE_PERSISTENT_SESSIONS");
  assert.equal(FLAG_DEFAULTS.FEATURE_PERSISTENT_SESSIONS, false);
  assert.equal(persistentSessionsEnabled({}), false);
  assert.equal(persistentSessionsEnabled({ FEATURE_PERSISTENT_SESSIONS: "0" }), false);
  assert.equal(persistentSessionsEnabled({ FEATURE_PERSISTENT_SESSIONS: "1" }), true);
  assert.match(read(".env.example"), /^FEATURE_PERSISTENT_SESSIONS=0$/m);
  assert.doesNotMatch(read(".env.example"), /^FEATURE_PERSISTENT_SESSIONS=1$/m);
});

test("the website checkbox is unticked-by-default copy and skips admin login", () => {
  assert.equal(keepMeLabel("en"), "Keep me signed in for 30 days");
  assert.equal(keepMeLabel("fr"), "Rester connecté pendant 30 jours");
  assert.match(read("src/lib/copy-en.ts"), /keepSignedIn: "Keep me signed in for 30 days"/);
  assert.match(read("src/lib/copy-fr.ts"), /keepSignedIn: "Rester connecté pendant 30 jours"/);
  assert.equal(showKeepMeSignedIn({ flagOn: false, operator: false, adminLogin: false, shell: false, mode: "in" }), false);
  assert.equal(showKeepMeSignedIn({ flagOn: true, operator: true, adminLogin: false, shell: false, mode: "in" }), false);
  assert.equal(showKeepMeSignedIn({ flagOn: true, operator: false, adminLogin: true, shell: false, mode: "in" }), false);
  assert.equal(showKeepMeSignedIn({ flagOn: true, operator: false, adminLogin: false, shell: true, mode: "in" }), false);
  assert.equal(showKeepMeSignedIn({ flagOn: true, operator: false, adminLogin: false, shell: false, mode: "up" }), false);
  assert.equal(showKeepMeSignedIn({ flagOn: true, operator: false, adminLogin: false, shell: false, mode: "in" }), true);
  assert.match(read("src/routes/login.tsx"), /useState\(false\)/);
  assert.match(read("src/routes/login.tsx"), /data-ke="keep-signed-in"/);
  assert.doesNotMatch(read("src/components/gov/gov-login.tsx"), /keep-signed-in/);
});

test("shell sessions have no idle timeout and the website remember choice is 30 days", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  const shell = initialSessionWindow({ shell: true, remember: false, nowMs: now });
  assert.equal(shell.idleMs, null);
  assert.equal(cookieMaxAgeSec({ shell: true, remember: false }), 400 * 24 * 60 * 60);
  const remembered = initialSessionWindow({ shell: false, remember: true, nowMs: now });
  assert.equal(remembered.absoluteMs - now, WEB_REMEMBER_SEC * 1000);
  assert.equal(cookieMaxAgeSec({ shell: false, remember: true }), WEB_REMEMBER_SEC);
  const unticked = initialSessionWindow({ shell: false, remember: false, nowMs: now });
  assert.equal(unticked.idleMs - now, WEB_IDLE_MS);
  assert.equal(cookieMaxAgeSec({ shell: false, remember: false }), null);
  const quiet = nextSessionWindow({
    shell: false,
    remember: false,
    nowMs: now + WEB_IDLE_MS,
    absoluteMs: unticked.absoluteMs,
    idleMs: unticked.idleMs,
  });
  assert.equal(quiet.expired, true);
  const phone = nextSessionWindow({
    shell: true,
    remember: true,
    nowMs: now + 20 * 24 * 60 * 60 * 1000,
    absoluteMs: shell.absoluteMs,
    idleMs: null,
  });
  assert.equal(phone.expired, false);
  assert.equal(phone.idleMs, null);
});

test("refresh rotates, a reused token is revoked, and push is kept", () => {
  const now = 1_000_000;
  assert.equal(
    decideRefresh({
      presentedHash: "abc",
      currentHash: "abc",
      previousHash: null,
      rotatedAtMs: null,
      nowMs: now,
      revoked: false,
      absoluteMs: now + 1000,
    }),
    "rotate",
  );
  assert.equal(
    decideRefresh({
      presentedHash: "old",
      currentHash: "new",
      previousHash: "old",
      rotatedAtMs: now - REFRESH_REUSE_GRACE_MS,
      nowMs: now,
      revoked: false,
      absoluteMs: now + 1000,
    }),
    "revoke",
  );
  assert.equal(
    decideRefresh({
      presentedHash: "old",
      currentHash: "new",
      previousHash: "old",
      rotatedAtMs: now - 1000,
      nowMs: now,
      revoked: false,
      absoluteMs: now + 1000,
    }),
    "rotate",
  );
  assert.equal(decideRefresh({
    presentedHash: "abc",
    currentHash: "abc",
    previousHash: null,
    rotatedAtMs: null,
    nowMs: now,
    revoked: true,
    absoluteMs: now + 1000,
  }), "reject");
  assert.equal(pushActionFor("refresh"), "keep");
  assert.equal(pushActionFor("resume"), "reregister");
  assert.equal(pushActionFor("logout"), "unregister");
  assert.equal(pushActionFor("password_change"), "unregister");
  const refresh = read("src/lib/server/persistent-session.server.ts");
  const body = refresh.slice(refresh.indexOf("export async function refreshDeviceSession"), refresh.indexOf("export async function enforcePersistentSession"));
  assert.doesNotMatch(body, /push_device_tokens/);
  assert.match(refresh, /a session refresh must keep alerts arriving/i);
});

test("password change revokes every session only when the flag is on", () => {
  assert.deepEqual(revokePlan("password_change", false), { allSessions: false, currentSession: false, push: "none" });
  assert.deepEqual(revokePlan("password_change", true), { allSessions: true, currentSession: true, push: "all" });
  assert.deepEqual(revokePlan("account_delete", true), { allSessions: true, currentSession: true, push: "all" });
  assert.deepEqual(revokePlan("admin", true), { allSessions: true, currentSession: true, push: "all" });
  assert.deepEqual(revokePlan("security", true), { allSessions: true, currentSession: true, push: "all" });
  assert.deepEqual(revokePlan("logout", true), { allSessions: false, currentSession: true, push: "this" });
  const security = read("src/lib/server/account-security.ts");
  assert.match(security, /forgetUserSessions\(context\.userId, "password_change"\)/);
  assert.match(security, /token <> \$\{token\}/);
});

test("a parent cannot see or revoke another account's device", () => {
  assert.equal(sessionVisibleTo("parent-1", "parent-1"), true);
  assert.equal(sessionVisibleTo("provider-9", "parent-1"), false);
  assert.equal(sessionVisibleTo("parent-1", "provider-9"), false);
  assert.equal(sessionVisibleTo("", "parent-1"), false);
  assert.equal(enrollAllowed("parent"), true);
  assert.equal(enrollAllowed("provider"), true);
  assert.equal(enrollAllowed(null), true);
  assert.equal(enrollAllowed("admin"), false);
  assert.equal(enrollAllowed("support"), false);
  assert.equal(enrollAllowed("government"), false);
  const roles = read("src/lib/server/roles.ts");
  assert.match(roles, /resolveAdminAccess/);
  assert.doesNotMatch(read("src/lib/persistent-session.ts"), /resolveAdminAccess|canVisitDesk/);
});

test("step-up covers pickup people, bank details, and deleting a child when the flag is on", () => {
  for (const action of ["pickup_people", "payout_bank", "email_change", "password_change", "child_delete"]) {
    assert.equal(stepUpRequired(action, false), false);
    assert.equal(stepUpRequired(action, true), true);
  }
  assert.equal(stepUpRequired("search", true), false);
  assert.equal(pickupListChanged("Ada", "Ada"), false);
  assert.equal(pickupListChanged("Ada", "Ben"), true);
  const family = read("src/lib/server/family.ts");
  assert.match(family, /assertPersistentStepUp\(context\.userId, "pickup_people"\)/);
  assert.match(family, /assertPersistentStepUp\(context\.userId, "child_delete"\)/);
  assert.match(read("src/lib/server/connect-payments.ts"), /assertPersistentStepUp\(context\.userId, "payout_bank"\)/);
});

test("refresh tokens parse and the session cookie signature matches Better Auth", async () => {
  const token = formatRefreshToken("ds_abcdefghijkl", "abcdefghijklmnopqrstuvwxyz012345");
  assert.deepEqual(parseRefreshToken(token), { id: "ds_abcdefghijkl", secret: "abcdefghijklmnopqrstuvwxyz012345" });
  assert.equal(parseRefreshToken("nope"), null);
  const signed = await signSessionToken("session-token", "test-secret");
  const sig = signed.split(".").pop();
  assert.equal(isSessionCookieSignature(sig), true);
  const nodeSig = createHmac("sha256", "test-secret").update("session-token").digest("base64");
  assert.equal(signed, `session-token.${nodeSig}`);
  const hash = await sha256Hex("secret");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, "secret");
});

test("app shells include the native stores and the plain website does not", () => {
  assert.equal(requestIsAppShell({ userAgent: "KidEaseNative", cookie: "" }), true);
  assert.equal(requestIsAppShell({ userAgent: "Mozilla KidEaseStoreMicrosoft", cookie: "" }), true);
  assert.equal(requestIsAppShell({ userAgent: "Mozilla", cookie: "ke_store=microsoft" }), true);
  assert.equal(requestIsAppShell({ userAgent: "Mozilla", cookie: "", clientShell: true }), true);
  assert.equal(requestIsAppShell({ userAgent: "Mozilla", cookie: "" }), false);
});
