import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { govDeskDecision } from "../src/lib/gov/access.ts";
import { adminDeskGateRedirect } from "../src/lib/admin-desk-gate.ts";
import { isAccessProtectedPath, nativeAccessPathOutcome } from "../src/lib/native-admin.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * What getGovSession answers for each kind of visitor once the portal is open.
 * Staff and owners are "provider" profiles, admin is "admin": none has a gov actor.
 */
const GOV_SESSION = {
  guest: { ok: false },
  parent: { ok: false, otherAccount: true },
  staff: { ok: false, otherAccount: true },
  owner: { ok: false, otherAccount: true },
  gov: { ok: true },
  admin: { ok: false, otherAccount: true },
};
const PROFILE_ROLE = { guest: null, parent: "parent", staff: "provider", owner: "provider", gov: "government", admin: "admin" };

test("N-27: /gov on the website, per role", () => {
  const expected = {
    guest: { kind: "redirect", to: "login" },
    parent: { kind: "unavailable" },
    staff: { kind: "unavailable" },
    owner: { kind: "unavailable" },
    gov: { kind: "desk" },
    admin: { kind: "unavailable" },
  };
  for (const [who, session] of Object.entries(GOV_SESSION)) {
    assert.deepEqual(govDeskDecision({ nativeShell: false, portalOpen: true, session }), expected[who], who);
  }
  // A government account still goes to its email code, not the neutral page.
  assert.deepEqual(
    govDeskDecision({ nativeShell: false, portalOpen: true, session: { ok: false, needSecondFactor: true } }),
    { kind: "redirect", to: "verify" },
  );
  // Portal off: everyone goes home, as before.
  for (const session of Object.values(GOV_SESSION)) {
    assert.deepEqual(govDeskDecision({ nativeShell: false, portalOpen: false, session }), { kind: "redirect", to: "home" });
  }
  assert.deepEqual(
    govDeskDecision({ nativeShell: false, portalOpen: true, session: { ok: false, closed: true } }),
    { kind: "redirect", to: "home" },
  );
});

test("N-27: /gov in the store apps, per role (never the Admin note)", () => {
  const expected = {
    guest: "native-note",
    parent: "unavailable",
    staff: "unavailable",
    owner: "unavailable",
    gov: "native-note",
    admin: "unavailable",
  };
  for (const [who, session] of Object.entries(GOV_SESSION)) {
    assert.equal(govDeskDecision({ nativeShell: true, portalOpen: true, session }).kind, expected[who], who);
  }
  // A failed session check in the app shows the app note, not a loop.
  assert.equal(govDeskDecision({ nativeShell: true, portalOpen: false, session: null }).kind, "native-note");
});

test("N-27: the neutral page never redirects, so /gov and /fr/gov cannot loop", () => {
  for (const nativeShell of [false, true]) {
    for (const who of ["parent", "staff", "owner", "admin"]) {
      const d = govDeskDecision({ nativeShell, portalOpen: true, session: GOV_SESSION[who] });
      assert.equal(d.kind, "unavailable");
      assert.equal("to" in d, false);
    }
  }
  const guard = src("src/lib/gov/desk-guard.ts");
  assert.match(guard, /govDeskDecision\(/);
  assert.match(guard, /kind === "unavailable"\) return \{ nativeOnly: true as const, govUnavailable: true as const \}/);
  // Loaders skip desk data whenever nativeOnly is set (both locales).
  for (const file of ["src/routes/gov.tsx", "src/routes/fr.gov.tsx", "src/routes/gov_.analytics.tsx", "src/routes/fr.gov_.analytics.tsx"]) {
    assert.match(src(file), /if \(gate\.nativeOnly\) return null;/, file);
    assert.match(src(file), /guardGovDesk\("(en|fr)"/, file);
  }
});

test("N-27: getGovSession marks signed-in non-government accounts; the gov actor needs the government role", () => {
  const portal = src("src/lib/server/gov-portal.ts");
  assert.match(portal, /if \(!actor\) return \{ ok: false as const, otherAccount: true as const \};/);
  assert.match(portal, /if \(!user\) return \{ ok: false as const \};/);
  assert.match(src("src/lib/server/gov-actor.server.ts"), /if \(String\(row\.role\) !== "government"\) return null;/);
});

test("N-27: the neutral page has EN + FR copy and says nothing about the desk", async () => {
  const { govCopy } = await import("../src/lib/gov/copy.ts");
  for (const locale of ["en", "fr"]) {
    const copy = govCopy(locale);
    for (const key of ["unavailableTitle", "unavailableBody", "unavailableHome", "unavailableHelp"]) {
      assert.ok(copy[key] && copy[key].length > 3, `${locale} ${key}`);
      assert.doesNotMatch(copy[key], /gov|admin|officer|ministry|ministère|bureau/i, `${locale} ${key}`);
    }
  }
  assert.match(govCopy("en").unavailableTitle, /not available for your account/);
  assert.match(govCopy("fr").unavailableTitle, /n’est pas offerte pour votre compte/);
  const note = src("src/components/gov/gov-login.tsx");
  assert.match(note, /govUnavailable === true/);
  assert.match(note, /if \(unavailable\) return <AccountUnavailableNote locale=\{locale\} \/>;/);
  assert.match(note, /data-ke="account-unavailable-home"/);
});

test("N-27: /admin* is a plain 404 for everyone but the admin account", () => {
  // Non-admin and signed-out failures from assertAdminDesk.
  for (const message of ["Unauthorized", "Not authorized", "admin-gate-timeout", "anything else"]) {
    assert.deepEqual(adminDeskGateRedirect(new Error(message)), { notFound: true }, message);
  }
  // The admin account without today's email code goes to the code step.
  assert.deepEqual(adminDeskGateRedirect(new Error("Two-factor verification required")), {
    to: "/verify-2fa",
    search: { next: "/admin" },
  });
  // The /admin 404 is the site's plain 404, not a sign-in page.
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /notFoundComponent: DefaultNotFound/);
  assert.doesNotMatch(admin, /AdminSignedOut/);
  // /admin-support: signed out is a 404 too, no /login redirect.
  const support = src("src/routes/admin-support.tsx");
  assert.doesNotMatch(support, /to: "\/login"/);
  assert.match(support, /throw notFound\(\)/);
});

test("N-27: in the store apps, only the admin account sees the Admin note for /admin*", () => {
  const expected = { guest: "not-found", parent: "not-found", staff: "not-found", owner: "not-found", gov: "not-found", admin: "note" };
  for (const [who, role] of Object.entries(PROFILE_ROLE)) {
    assert.equal(nativeAccessPathOutcome(role), expected[who], who);
  }
  assert.equal(isAccessProtectedPath("/fr/admin"), true);
  assert.equal(isAccessProtectedPath("/gov"), false);
  const root = src("src/routes/__root.tsx");
  assert.match(
    root,
    /hideAdmin && isAccessProtectedPath\(location\.pathname\) && nativeAccessPathOutcome\(roleChrome\.role\) === "note"/,
  );
});
