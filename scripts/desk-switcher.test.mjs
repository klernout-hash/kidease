import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { desksFor, headerDesks, showDeskSwitcher } from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("session desks are fetched once and shared", () => {
  const provider = src("src/components/session-desks.tsx");
  assert.match(provider, /SessionDesksProvider/);
  assert.match(provider, /getMyDesks/);
  assert.match(provider, /writeStickyDesk/);
  assert.match(provider, /setSticky/);
  assert.match(src("src/lib/desks.ts"), /localStorage\.setItem\(STICKY_DESK_KEY/);
  assert.match(src("src/lib/desks.ts"), /localStorage\.removeItem\(STICKY_DESK_KEY/);
  const auth = src("src/lib/auth/provider.tsx");
  assert.match(auth, /SessionDesksProvider/);
  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /from "@\/components\/session-desks"/);
  assert.doesNotMatch(switcher, /getMyDesks/);
  const client = src("src/lib/auth/client.ts");
  assert.match(client, /clearStickyDesk/);
});

test("login preserves ?desk= and does not rewrite Better Auth cookies", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /parseDeskQuery/);
  assert.match(login, /writeStickyDesk/);
  assert.match(login, /resolvePostLoginPath/);
  assert.match(login, /deskQueryValue/);
  assert.doesNotMatch(login, /sessionStorage\.setItem\("better-auth/);
  const gates = src("src/lib/auth/gates.tsx");
  assert.match(gates, /deskQueryValue/);
  assert.match(gates, /loginRoleFromDesk/);
  assert.match(gates, /parseDeskQuery/);
});

test("admin desk stays gated by profiles.role + owner email", () => {
  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /isKidEaseOperatorEmail/);
  assert.match(roles, /kyle@kidease\.ca/);
  assert.match(roles, /bootstrapEmail/);
  assert.match(roles, /assertAdminDesk/);
  assert.match(roles, /requireAdmin/);
  const admin = (src("src/routes/admin.tsx") + "\n" + src("src/components/admin-desk-page.tsx"));
  assert.match(admin, /canVisitDesk\(session\.desks, "admin", session\.role, session\.email\)/);
  assert.match(admin, /beforeLoadAdminDesk/);
  assert.match(admin, /profiles\.role = admin/);
  assert.match(admin, /Not found/);
  assert.match(src("src/routes/admin-chat.tsx"), /beforeLoadAdminDesk/);
  assert.match(src("src/routes/admin-contracts.tsx"), /beforeLoadAdminDesk/);
  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /headerDesks\(session\.desks, session\.role, session\.email\)/);
  assert.match(switcher, /showDeskSwitcher\(session\.desks, session\.role, session\.email\)/);
  assert.match(switcher, /do not call setRole/);
  assert.match(switcher, /deskSwitcherLabel/);
  assert.match(switcher, /openAdminDesk\(\)/);
  assert.doesNotMatch(switcher, /if \(desk === "admin"\) return null/);
  assert.doesNotMatch(switcher, /AdminDeskLink/);
  assert.match(src("src/components/shell.tsx"), /canSeeAdminDesk\(session\?\.role, session\?\.email/);
  assert.match(src("src/components/desk-shell.tsx"), /data-ke="desk-switcher-slot"/);
  assert.doesNotMatch(src("src/components/shell.tsx"), /desksSlot/);
  assert.doesNotMatch(src("src/components/nav-drawer.tsx"), /desksSlot/);
  assert.match(src("src/components/session-desks.tsx"), /sanitizeStickyDesk/);
  assert.match(src("src/components/session-desks.tsx"), /canVisitDesk/);
  assert.match(src("src/routes/index.tsx"), /homeLandPath/);
});

test("admin sees Parent, Daycare, and Admin as the top desk tabs", () => {
  const desks = headerDesks(desksFor({ role: "admin" }), "admin", "kyle@kidease.ca");
  assert.deepEqual(desks, ["parent", "provider", "admin"]);
  assert.equal(showDeskSwitcher(desksFor({ role: "admin" }), "admin", "kyle@kidease.ca"), true);
  assert.equal(showDeskSwitcher(desksFor({ role: "admin" }), "admin", "parent@example.com"), false);

  const shell = src("src/components/desk-shell.tsx");
  const rowAt = shell.indexOf('data-ke="desk-switcher-slot"');
  assert.ok(rowAt > 0);
  const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
  assert.match(aside, /<DeskSwitcher/);
  assert.doesNotMatch(shell, /data-ke="desk-switcher-row"/);
  assert.match(shell, /showDeskSwitcher\(session\.desks, session\.role, session\.email\)/);

  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /data-ke="desk-switcher"/);
  assert.match(switcher, /data-ke="desk-switch-tab"/);
  assert.match(switcher, /data-desk=\{desk\}/);
  assert.match(switcher, /aria-current=\{on \? "page" : undefined\}/);
  assert.match(switcher, /deskParent/);
  assert.match(switcher, /deskDirector/);
  assert.match(switcher, /deskAdmin/);
  assert.doesNotMatch(src("src/components/menu-desk-tools.tsx"), /<DeskSwitcher/);
  assert.match(src("src/components/nav-drawer.tsx"), /<DeskSwitcher/);
  assert.doesNotMatch(src("src/components/shell.tsx"), /<DeskSwitcher/);
});

test("daycare-only and parent-only users do not get the 3-desk switcher", () => {
  assert.equal(showDeskSwitcher(desksFor({ role: "provider" }), "provider"), false);
  assert.equal(showDeskSwitcher(desksFor({ role: "provider" }), "provider", "kyle@kidease.ca"), false);
  assert.equal(showDeskSwitcher(desksFor({ role: "provider" }), "provider", "director@example.com"), false);
  assert.deepEqual(headerDesks(desksFor({ role: "provider" }), "provider", "kyle@kidease.ca"), ["provider"]);
  assert.equal(headerDesks(desksFor({ role: "provider" }), "provider").includes("parent"), false);
  assert.equal(headerDesks(desksFor({ role: "provider" }), "provider").includes("admin"), false);

  assert.equal(showDeskSwitcher(desksFor({ role: "parent" }), "parent"), false);
  assert.equal(showDeskSwitcher(desksFor({ role: "parent" }), "parent", "parent@example.com"), false);
  assert.equal(showDeskSwitcher(desksFor({ role: "parent" }), "parent", "kyle@kidease.ca"), false);
  assert.deepEqual(headerDesks(desksFor({ role: "parent" }), "parent"), ["parent"]);
  assert.equal(headerDesks(desksFor({ role: "parent" }), "parent").includes("provider"), false);
  assert.equal(headerDesks(desksFor({ role: "parent" }), "parent").includes("admin"), false);

  assert.equal(showDeskSwitcher(desksFor({ role: "parent", ownsCentre: true }), "parent"), true);
  assert.equal(headerDesks(["admin", "parent", "provider"], "parent", "parent@example.com").includes("admin"), false);
  assert.equal(showDeskSwitcher(["admin", "parent", "provider"], "parent", "parent@example.com"), true);
  assert.equal(showDeskSwitcher(["provider", "parent"], "provider", "kyle@kidease.ca"), false);
});
