import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminDeskGateRedirect,
  adminGateFailureKind,
  ADMIN_LOGIN_SEARCH,
} from "../src/lib/admin-desk-gate.ts";
import {
  canSeeAdminDesk,
  canVisitDesk,
  DESK_PATH,
  desksFor,
  headerDesks,
  openAdminDesk,
} from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("admin desk path is /admin", () => {
  assert.equal(DESK_PATH.admin, "/admin");
});

test("header pills include Admin only for admin-role sessions", () => {
  assert.deepEqual(headerDesks(desksFor({ role: "admin" }), "admin"), ["admin", "parent", "provider"]);
  assert.equal(headerDesks(desksFor({ role: "parent" }), "parent").includes("admin"), false);
  assert.equal(headerDesks(desksFor({ role: "provider" }), "provider").includes("admin"), false);
  assert.equal(headerDesks(desksFor({ role: "parent", ownsCentre: true }), "parent").includes("admin"), false);
  assert.equal(canSeeAdminDesk("admin"), true);
  assert.equal(canSeeAdminDesk("parent"), false);
  assert.equal(canSeeAdminDesk("provider"), false);
  assert.equal(canVisitDesk(["admin", "parent", "provider"], "admin", "admin"), true);
  assert.equal(canVisitDesk(["admin", "parent", "provider"], "admin", "parent"), false);
  assert.equal(canVisitDesk(["parent"], "admin", "admin"), false);
});

test("signed-out and hung admin gate go to Titan login, not home", () => {
  assert.deepEqual(adminDeskGateRedirect(new Error("Unauthorized")), {
    to: "/login",
    search: ADMIN_LOGIN_SEARCH,
  });
  assert.deepEqual(adminDeskGateRedirect(new Error("admin-gate-timeout")), {
    to: "/login",
    search: ADMIN_LOGIN_SEARCH,
  });
  assert.equal(adminGateFailureKind("UnauthorizedError: Unauthorized"), "login");
});

test("admin 2FA failure opens verify-2fa instead of bouncing home", () => {
  assert.deepEqual(adminDeskGateRedirect(new Error("Two-factor verification required")), {
    to: "/verify-2fa",
    search: { next: "/admin" },
  });
  assert.equal(adminGateFailureKind("two-factor cookie missing"), "two_factor");
});

test("parent or daycare hitting /admin still go home", () => {
  assert.deepEqual(adminDeskGateRedirect(new Error("Not authorized")), { to: "/" });
  assert.equal(adminGateFailureKind("Not authorized"), "home");
});

test("header, hamburger, and menu Admin entries document-navigate to /admin", () => {
  const switcher = src("src/components/desk-switcher.tsx");
  const drawer = src("src/components/nav-drawer.tsx");
  const menu = src("src/components/menu-desk-tools.tsx");
  const link = src("src/components/admin-desk-link.tsx");
  const desks = src("src/lib/desks.ts");
  assert.match(link, /href=\{DESK_PATH\.admin\}/);
  assert.match(link, /data-ke="admin-desk"/);
  assert.match(link, /openAdminDesk/);
  assert.match(desks, /window\.location\.assign\(DESK_PATH\.admin\)/);
  assert.match(switcher, /AdminDeskLink/);
  assert.match(switcher, /desk === "admin"/);
  assert.match(drawer, /AdminDeskLink/);
  assert.match(drawer, /isAdmin/);
  assert.match(menu, /AdminDeskLink/);
  assert.match(menu, /canSeeAdminDesk\(session\?\.role\)/);
  assert.match(src("src/components/shell.tsx"), /canSeeAdminDesk\(session\?\.role\)/);
  assert.doesNotMatch(drawer, /to="\/admin"/);
  assert.doesNotMatch(menu, /to="\/admin"/);
});

test("document /admin gate is role-only; APIs still require 2FA", () => {
  const roles = src("src/lib/server/roles.ts");
  const gate = src("src/lib/server/admin-route.ts");
  const assertBlock = roles.slice(roles.indexOf("export const assertAdminDesk"));
  assert.match(assertBlock, /resolveAdminAccess/);
  assert.match(assertBlock, /Not authorized/);
  assert.doesNotMatch(assertBlock, /requireAdmin/);
  assert.doesNotMatch(assertBlock, /assertTwoFactorVerified/);
  assert.match(roles, /export async function requireAdmin/);
  assert.match(roles, /assertTwoFactorVerified/);
  assert.match(gate, /adminDeskGateRedirect/);
  assert.match(gate, /beforeLoadAdminDesk/);
});

test("openAdminDesk is a document assign and writes the sticky desk", () => {
  assert.equal(typeof openAdminDesk, "function");
  const desks = src("src/lib/desks.ts");
  const fn = desks.slice(desks.indexOf("export function openAdminDesk"));
  assert.match(fn, /writeStickyDesk\("admin"\)/);
  assert.match(fn, /location\.assign\(DESK_PATH\.admin\)/);
});
