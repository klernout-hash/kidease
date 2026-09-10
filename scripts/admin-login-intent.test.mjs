import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isAdminLoginIntent, loginErrorCallbackUrl } from "../src/lib/desks.ts";
import { emailAndPasswordEnabled } from "../src/lib/auth/email-password.ts";
import { KIDEASE_OPERATOR_EMAIL } from "../src/lib/admin-email.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("admin login intent is email-first for Admin / intent=admin / next=/admin", () => {
  assert.equal(isAdminLoginIntent({ role: "admin" }), true);
  assert.equal(isAdminLoginIntent({ desk: "admin" }), true);
  assert.equal(isAdminLoginIntent({ intent: "admin" }), true);
  assert.equal(isAdminLoginIntent({ next: "/admin" }), true);
  assert.equal(isAdminLoginIntent({ intent: "in", next: "/admin" }), true);
  assert.equal(isAdminLoginIntent({ next: "/admin/contracts" }), true);
  assert.equal(isAdminLoginIntent({ next: "/admin-contracts" }), true);
  assert.equal(isAdminLoginIntent({ next: "/admin-chat" }), true);
  assert.equal(isAdminLoginIntent({ role: "Admin", next: "/parent" }), true);
});

test("parent and daycare login stay off the admin email-first path", () => {
  assert.equal(isAdminLoginIntent({}), false);
  assert.equal(isAdminLoginIntent({ intent: "in" }), false);
  assert.equal(isAdminLoginIntent({ intent: "up" }), false);
  assert.equal(isAdminLoginIntent({ role: "parent", desk: "parent", intent: "in", next: "/parent" }), false);
  assert.equal(isAdminLoginIntent({ role: "provider", desk: "director", intent: "in", next: "/provider" }), false);
  assert.equal(isAdminLoginIntent({ next: "/search" }), false);
  assert.equal(isAdminLoginIntent({ next: "/daycare/example" }), false);
});

test("login screen uses admin intent and hides social for that path", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /isAdminLoginIntent/);
  assert.match(login, /intent === "admin"/);
  assert.match(login, /data-ke="admin-titan-note"/);
  assert.match(login, /data-ke=\{operator \? "admin-email-first" : "email-sign-in"\}/);
  assert.match(login, /data-ke="social-sign-in"/);
  assert.match(login, /\{!operator \? \(/);
  assert.match(login, /forgotPassword/);
  assert.match(login, /KIDEASE_OPERATOR_EMAIL/);
  assert.doesNotMatch(login, /const operator = role === "admin"/);
});

test("signed-out /admin gate and footer send Admin email-first search", () => {
  const gate = src("src/lib/server/admin-route.ts");
  const dest = src("src/lib/admin-desk-gate.ts");
  assert.match(gate, /adminDeskGateRedirect/);
  assert.match(dest, /intent: "admin"/);
  assert.match(dest, /role: "admin"/);
  assert.match(dest, /desk: "admin"/);
  assert.match(dest, /next: "\/admin"/);
  assert.match(src("src/components/site-footer.tsx"), /intent: "admin"/);
  assert.equal(
    loginErrorCallbackUrl({
      role: "admin",
      desk: "admin",
      intent: "admin",
      next: "/admin",
    }),
    "/login?intent=admin&role=admin&desk=admin&next=%2Fadmin",
  );
});

test("operator copy notes Titan email, not Google", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /kyle@kidease\.ca signs in with email \(Titan\), not Google/);
  assert.match(copy, /kyle@kidease\.ca se connecte par courriel \(Titan\), pas Google/);
  assert.match(copy, /operatorEmailNote/);
  assert.match(copy, /operatorLead/);
  assert.equal(KIDEASE_OPERATOR_EMAIL, "kyle@kidease.ca");
  const support = src("scripts/support-desk.test.mjs");
  assert.match(support, /operatorEmailNote/);
});

test("reset and verification mail stay on Resend, not Titan SMTP", () => {
  assert.equal(emailAndPasswordEnabled, true);
  const emailPassword = src("src/lib/auth/email-password.ts");
  const resetMail = src("src/lib/server/reset-mail.ts");
  const twoFa = src("src/lib/server/two-factor.ts");
  const security = src("SECURITY.md");
  assert.match(emailPassword, /sendPasswordResetEmail/);
  assert.match(emailPassword, /reset-mail/);
  assert.match(resetMail, /api\.resend\.com\/emails/);
  assert.doesNotMatch(emailPassword, /smtp\.titan\.email/);
  assert.doesNotMatch(resetMail, /smtp\.titan\.email/);
  assert.match(twoFa, /api\.resend\.com\/emails/);
  assert.doesNotMatch(twoFa, /smtp\.titan\.email/);
  assert.match(security, /login@send\.kidease\.ca/);
  assert.match(security, /Do \*\*not\*\* send auth mail through Titan SMTP/);
  assert.match(security, /Allowlist `login@send\.kidease\.ca`/);
});

test("Google IdP and admin-email bootstrap stay unchanged", () => {
  assert.match(src("src/lib/auth/google-idp.ts"), /socialProviders\.google/);
  assert.match(src("src/lib/auth/server.ts"), /socialProviders/);
  assert.match(src("src/lib/admin-email.ts"), /Only kyle@kidease\.ca is auto-bootstrapped/);
  assert.match(src("src/lib/admin-email.ts"), /Open Road mailboxes/);
  assert.doesNotMatch(src("src/lib/admin-email.ts"), /Titan/);
});
