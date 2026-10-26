import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  decideVerify2faSessionGate,
  mapAuthSessionUser,
  VERIFY_2FA_SESSION_GRACE_MS,
  verify2faSearchNext,
} from "../src/lib/auth/verify-2fa-session.ts";
import { SESSION_SETTLE_RETRIES } from "../src/lib/auth/session-settle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("session pending then ready on verify-2fa does not redirect to login", () => {
  const frames = [
    decideVerify2faSessionGate({ hasUser: false, isPending: true, graceElapsed: false }),
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: false }),
    decideVerify2faSessionGate({ hasUser: true, isPending: false, graceElapsed: false }),
  ];
  assert.deepEqual(frames, ["wait", "wait", "ready"]);
  assert.ok(!frames.includes("signed_out"));
});

test("empty session after OAuth stays on wait until grace elapses", () => {
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: false }),
    "wait",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: true, graceElapsed: true }),
    "wait",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: false, isPending: false, graceElapsed: true }),
    "signed_out",
  );
  assert.equal(
    decideVerify2faSessionGate({ hasUser: true, isPending: false, graceElapsed: true }),
    "ready",
  );
});

test("grace covers the get-session retry budget after Google callback", () => {
  const budget = SESSION_SETTLE_RETRIES.reduce((sum, ms) => sum + ms, 0);
  assert.ok(VERIFY_2FA_SESSION_GRACE_MS >= budget);
  assert.ok(VERIFY_2FA_SESSION_GRACE_MS <= 5000);
});

test("verify-2fa next never loops through /login or /verify-2fa", () => {
  assert.equal(verify2faSearchNext("/parent"), "/parent");
  assert.equal(verify2faSearchNext("/admin"), "/admin");
  assert.equal(verify2faSearchNext("/login"), "/parent");
  assert.equal(verify2faSearchNext("/verify-2fa"), "/parent");
  assert.equal(verify2faSearchNext("/login?next=/login"), "/parent");
  assert.equal(verify2faSearchNext("/verify-2fa?next=/admin"), "/admin");
  assert.equal(verify2faSearchNext("/verify-2fa?next=/login"), "/parent");
  assert.equal(verify2faSearchNext("https://evil.example/"), "/parent");
  assert.equal(verify2faSearchNext(""), "/parent");
  assert.equal(verify2faSearchNext(undefined), "/parent");
});

test("mapAuthSessionUser accepts a Better Auth user and rejects junk", () => {
  assert.deepEqual(mapAuthSessionUser({ id: "u1", name: "Kyle", email: "k@example.com" }), {
    id: "u1",
    displayName: "Kyle",
    primaryEmail: "k@example.com",
    profileImageUrl: null,
    isDevFallback: false,
  });
  assert.equal(mapAuthSessionUser(null), null);
  assert.equal(mapAuthSessionUser({}), null);
  assert.equal(mapAuthSessionUser({ id: "" }), null);
});

test("verify-2fa page waits for the session gate before RedirectToSignIn", () => {
  const route = src("src/routes/verify-2fa.tsx");
  assert.match(route, /decideVerify2faSessionGate/);
  assert.match(route, /waitForSignedInSession/);
  assert.match(route, /VERIFY_2FA_SESSION_GRACE_MS/);
  assert.match(route, /verify2faSearchNext/);
  assert.match(route, /phase === "wait"/);
  assert.match(route, /phase === "signed_out"/);
  assert.match(route, /data-ke="verify-2fa-session-wait"/);
  assert.doesNotMatch(route, /if \(!user\) return <RedirectToSignIn \/>/);
  assert.match(route, /staffTwoFactorRequired/);
  assert.match(route, /needTurnstile/);
});
