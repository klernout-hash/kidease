import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { socialSignupCallbackPath } from "../src/lib/auth/social-callback.ts";
import { e2eChromeFromRequest } from "../src/lib/e2e-role-cookie.ts";
import { ADMIN_LOGIN_SEARCH } from "../src/lib/admin-desk-gate.ts";
import { adminAutoContinueDecision } from "../src/lib/auth/login-stall.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("social daycare sign-up returns through login intent=up before /provider", () => {
  const path = socialSignupCallbackPath({
    intent: "up",
    role: "provider",
    desk: "director",
    next: "/provider",
  });
  assert.ok(path);
  assert.match(path, /^\/login\?/);
  assert.match(path, /intent=up/);
  assert.match(path, /role=provider/);
  assert.doesNotMatch(path, /^\/provider/);
  assert.equal(socialSignupCallbackPath({ intent: "in", role: "provider", next: "/provider" }), null);
  const login = readFileSync(join(root, "src/routes/login.tsx"), "utf8");
  const social = login.indexOf("socialSignupCallbackPath");
  const setRole = login.indexOf("setRole({ data: role })");
  const cont = login.indexOf("continueAfterSignIn({", setRole);
  assert.ok(social > 0 && setRole > 0 && cont > setRole);
});

test("Sign in again never auto-continues, and the role cookie cannot be admin", () => {
  assert.equal(
    adminAutoContinueDecision({
      adminIntent: true,
      sessionEmail: "parent@example.com",
      ownerEmail: "kyle@kidease.ca",
    }),
    "block",
  );
  assert.equal(ADMIN_LOGIN_SEARCH.intent, "admin");
  assert.equal(ADMIN_LOGIN_SEARCH.next, "/admin");
  const cookie = "kidease_e2e_role=admin; kidease_e2e_plan=paid";
  assert.equal(
    e2eChromeFromRequest({
      fixtureEnabled: true,
      host: "127.0.0.1:8081",
      cookie,
      productionBuild: false,
    }),
    null,
  );
  assert.equal(
    e2eChromeFromRequest({
      fixtureEnabled: true,
      host: "127.0.0.1:8081",
      cookie: "kidease_e2e_role=provider",
      productionBuild: true,
    }),
    null,
  );
  const dev = e2eChromeFromRequest({
    fixtureEnabled: true,
    host: "127.0.0.1:8081",
    cookie: "kidease_e2e_role=provider",
    productionBuild: false,
  });
  assert.equal(dev?.role, "provider");
  const gate = readFileSync(join(root, "src/lib/server/admin-route.ts"), "utf8");
  assert.doesNotMatch(gate, /chrome\?\.e2e/);
  assert.doesNotMatch(gate, /chrome\.role === "admin"/);
});

test("role mismatch scripts print ids only and default to dry-run", () => {
  const audit = readFileSync(join(root, "scripts/audit-role-mismatch.mjs"), "utf8");
  const fix = readFileSync(join(root, "scripts/fix-role-mismatch.mjs"), "utf8");
  assert.match(audit, /DATABASE_URL/);
  assert.doesNotMatch(audit, /email|phone|name/i);
  assert.match(fix, /dryRun: !apply/);
  assert.match(fix, /--apply/);
  assert.match(fix, /--rollback/);
  assert.doesNotMatch(fix, /select[^;]*email/i);
});
