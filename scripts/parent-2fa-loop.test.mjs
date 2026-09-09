import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { shouldOpenTwoFactorPage } from "../src/lib/auth/login-funnel.ts";
import {
  nextTwoFactorNav,
  staffTwoFactorRequired,
  twoFactorGateState,
  twoFactorPageUrl,
} from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function hopsUntilSettle(start) {
  const seen = [];
  let at = start.at;
  for (let i = 0; i < 8; i += 1) {
    const next = nextTwoFactorNav({ ...start, at });
    const pair = `${at}=>${next}`;
    if (seen.includes(pair)) {
      return { looped: true, hops: [...seen, pair], settled: next };
    }
    seen.push(pair);
    if (next === at) return { looped: false, hops: seen, settled: next };
    at = next;
  }
  return { looped: true, hops: seen, settled: at };
}

test("parent dest + unverified must not Navigate loop between /parent and /verify-2fa", () => {
  assert.equal(twoFactorGateState(false, "/parent"), "ok");
  assert.equal(twoFactorGateState(false, "/provider"), "ok");
  assert.equal(twoFactorGateState(false, "/admin"), "need");
  assert.equal(twoFactorGateState(false, "/support"), "need");
  assert.equal(twoFactorGateState(true, "/admin"), "ok");
  assert.equal(twoFactorGateState(true, "/parent"), "ok");

  const parentSkip = hopsUntilSettle({
    at: "/parent",
    dest: "/parent",
    verified: false,
    leftWithoutCookie: true,
  });
  assert.equal(parentSkip.looped, false);
  assert.equal(parentSkip.settled, "/parent");
  assert.ok(!parentSkip.hops.some((h) => h.includes("/verify-2fa")));

  const parentFromCode = hopsUntilSettle({
    at: "/verify-2fa",
    dest: "/parent",
    verified: false,
    leftWithoutCookie: true,
  });
  assert.equal(parentFromCode.looped, false);
  assert.equal(parentFromCode.settled, "/parent");
  assert.deepEqual(parentFromCode.hops, ["/verify-2fa=>/parent", "/parent=>/parent"]);

  const providerSkip = hopsUntilSettle({
    at: "/provider",
    dest: "/provider",
    verified: false,
    leftWithoutCookie: true,
  });
  assert.equal(providerSkip.looped, false);
  assert.equal(providerSkip.settled, "/provider");
});

test("admin/support still fail closed to /verify-2fa when unverified", () => {
  assert.equal(staffTwoFactorRequired("/admin"), true);
  assert.equal(staffTwoFactorRequired("/parent"), false);
  const admin = hopsUntilSettle({
    at: "/admin",
    dest: "/admin",
    verified: false,
    leftWithoutCookie: true,
  });
  assert.equal(admin.settled, "/verify-2fa");
  assert.ok(admin.hops[0].includes(twoFactorPageUrl("/admin")));

  const supportStay = nextTwoFactorNav({
    at: "/verify-2fa",
    dest: "/support",
    verified: false,
    leftWithoutCookie: true,
  });
  assert.equal(supportStay, "/verify-2fa");
});

test("shouldOpenTwoFactorPage is false for parent/provider even when unverified", async () => {
  assert.equal(await shouldOpenTwoFactorPage("/parent", Promise.resolve({ verified: false })), false);
  assert.equal(await shouldOpenTwoFactorPage("/provider", Promise.resolve({ verified: false })), false);
  assert.equal(await shouldOpenTwoFactorPage("/search", Promise.resolve({ verified: false })), false);
  assert.equal(await shouldOpenTwoFactorPage("/admin", Promise.resolve({ verified: false })), true);
  assert.equal(await shouldOpenTwoFactorPage("/admin", Promise.resolve({ verified: true })), false);
  assert.equal(await shouldOpenTwoFactorPage("/support/sc_1", Promise.reject(new Error("status"))), true);
});

test("gate and funnel no longer treat parent verified:false as a hard Navigate", () => {
  const gates = src("src/lib/auth/gates.tsx");
  const funnel = src("src/lib/auth/login-funnel.ts");
  const desks = src("src/lib/desks.ts");
  assert.match(gates, /twoFactorGateState/);
  assert.doesNotMatch(gates, /setState\(s\.verified \? "ok" : "need"\)/);
  assert.match(funnel, /optional_desk/);
  assert.match(funnel, /if \(!staffTwoFactorRequired\(dest\)\)/);
  assert.match(desks, /export function twoFactorGateState/);
  assert.match(desks, /export function nextTwoFactorNav/);
  assert.match(src("src/routes/parent.tsx"), /TwoFactorGate/);
  assert.match(src("src/routes/verify-2fa.tsx"), /if \(!staff\)/);
});
