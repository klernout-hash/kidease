import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  BLOCKED_ADMIN_EMAIL_DOMAINS,
  KIDEASE_OPERATOR_EMAIL,
  bootstrapAdminEmail,
  canBootstrapAdmin,
  effectiveAdminRole,
  isBlockedAdminEmail,
  isKidEaseOperatorEmail,
} from "../src/lib/admin-email.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("only kyle@kidease.ca is the KidEase operator mailbox", () => {
  assert.equal(KIDEASE_OPERATOR_EMAIL, "kyle@kidease.ca");
  assert.equal(isKidEaseOperatorEmail("Kyle@KidEase.ca"), true);
  assert.equal(isKidEaseOperatorEmail("kyle@openroadoutlet.ca"), false);
  assert.equal(isKidEaseOperatorEmail("support@kidease.ca"), false);
  assert.deepEqual(BLOCKED_ADMIN_EMAIL_DOMAINS, ["openroadoutlet.ca"]);
});

test("Open Road emails never bootstrap or keep Admin", () => {
  assert.equal(isBlockedAdminEmail("kyle@openroadoutlet.ca"), true);
  assert.equal(isBlockedAdminEmail("ops@mail.openroadoutlet.ca"), true);
  assert.equal(isBlockedAdminEmail("kyle@kidease.ca"), false);
  assert.equal(canBootstrapAdmin("kyle@openroadoutlet.ca"), false);
  assert.equal(canBootstrapAdmin("kyle@openroadoutlet.ca", "kyle@openroadoutlet.ca"), false);
  assert.equal(effectiveAdminRole({ storedRole: "admin", email: "kyle@openroadoutlet.ca" }), null);
  assert.equal(effectiveAdminRole({ storedRole: "admin", email: "kyle@kidease.ca" }), "admin");
  assert.equal(effectiveAdminRole({ storedRole: "parent", email: "kyle@kidease.ca" }), null);
});

test("ADMIN_EMAIL leftover Open Road is ignored", () => {
  assert.equal(bootstrapAdminEmail("kyle@openroadoutlet.ca"), "kyle@kidease.ca");
  assert.equal(bootstrapAdminEmail("not-an-email"), "kyle@kidease.ca");
  assert.equal(bootstrapAdminEmail("ops@example.com"), "kyle@kidease.ca");
  assert.equal(bootstrapAdminEmail("support@kidease.ca"), "support@kidease.ca");
  assert.equal(canBootstrapAdmin("kyle@kidease.ca", "kyle@openroadoutlet.ca"), true);
  assert.equal(canBootstrapAdmin("support@kidease.ca", "support@kidease.ca"), true);
});

test("admin gate and login refuse Open Road as KidEase admin", () => {
  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /isBlockedAdminEmail/);
  assert.match(roles, /canBootstrapAdmin/);
  assert.match(roles, /effectiveAdminRole/);
  assert.match(roles, /openroadoutlet/);
  assert.match(src("src/routes/login.tsx"), /KIDEASE_OPERATOR_EMAIL/);
  assert.doesNotMatch(src("src/routes/login.tsx"), /openroadoutlet/);
  assert.match(src("SECURITY.md"), /openroadoutlet\.ca/);
  assert.match(src("src/components/desk-switcher.tsx"), /headerDesks\(session\.desks, session\.role\)/);
  assert.match(src("src/components/desk-switcher.tsx"), /showDeskSwitcher\(session\.desks, session\.role\)/);
  assert.match(src("src/routes/menu.tsx"), /canSeeAdminDesk\(session\?\.role\)/);
  assert.match(src("src/routes/menu.tsx"), /canVisitDesk\(session\.desks, "admin", session\.role\)/);
  assert.match(src("src/components/shell.tsx"), /desksSlot/);
  assert.match(src("src/components/nav-drawer.tsx"), /to="\/admin"/);
});
