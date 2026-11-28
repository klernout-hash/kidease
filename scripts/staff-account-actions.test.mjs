import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  accountSectionHiddenForStaff,
  OPEN_ACCOUNT_SCOPE,
  STAFF_HIDDEN_ACCOUNT_SECTIONS,
  staffOnlyAccount,
} from "../src/lib/staff-permissions.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ALL_SECTIONS = ["profile", "alerts", "appearance", "subscription", "delete", "security", "email-sms", "documents", "refer", "wallet", "export"];
const visible = (scope) => ALL_SECTIONS.filter((id) => !accountSectionHiddenForStaff(id, scope));

test("N-43: who counts as a staff-only login on a centre account", () => {
  assert.equal(staffOnlyAccount({ profileRole: "provider", centreOwner: false, centreRole: "staff", centreCanInvite: false }), true);
  assert.equal(staffOnlyAccount({ profileRole: "parent", centreOwner: false, centreRole: "read_only", centreCanInvite: false }), true);
  // Owner, manager and admin keep every action.
  assert.equal(staffOnlyAccount({ profileRole: "provider", centreOwner: true, centreRole: "owner" }), false);
  assert.equal(staffOnlyAccount({ profileRole: "provider", centreOwner: false, centreRole: "manager", centreCanInvite: true }), false);
  assert.equal(staffOnlyAccount({ profileRole: "admin", centreOwner: false, centreRole: "staff" }), false);
  // A plain parent (no centre) is not staff.
  assert.equal(staffOnlyAccount({ profileRole: "parent", centreOwner: false, centreRole: null }), false);
});

test("N-43: staff see only their own profile actions", () => {
  assert.deepEqual([...STAFF_HIDDEN_ACCOUNT_SECTIONS], ["delete", "export", "wallet", "refer", "subscription"]);
  assert.deepEqual(visible({ staffOnly: true }), [
    "profile",
    "alerts",
    "appearance",
    "security",
    "email-sms",
    "documents",
  ]);
  // Owners, managers, parents: nothing hidden.
  assert.deepEqual(visible(OPEN_ACCOUNT_SCOPE), ALL_SECTIONS);

});

test("N-43: the server enforces it for delete, export, wallet, refer and upgrade", () => {
  const guard = src("src/lib/server/staff-account-guard.ts");
  assert.match(guard, /accountSectionHiddenForStaff\(action, scope\)\) throw new StaffAccountActionError\(\)/);
  assert.match(guard, /readonly status = 403/);
  assert.match(guard, /from centre_members\s+where user_id = \$\{userId\} and status = 'active'/);
  assert.match(guard, /row\.role === "manager" \|\| row\.permission_preset === "manager"/);
  const calls = [
    ["src/lib/server/family.ts", "delete", "export const deleteAccount"],
    ["src/lib/server/account-export.ts", "export", "export const exportMyData"],
    ["src/lib/server/connect-payments.ts", "wallet", "export const listWalletMethods"],
    ["src/lib/server/connect-payments.ts", "wallet", "export const createWalletSetup"],
    ["src/lib/server/connect-payments.ts", "wallet", "export const updateWalletMethod"],
    ["src/lib/server/connect-payments.ts", "wallet", "export const removeWalletMethod"],
    ["src/lib/server/parent-plus.ts", "subscription", "export const startParentPlusCheckout"],
    ["src/lib/server/provider-subscriptions.ts", "subscription", "export const startProviderCheckout"],
    ["src/routes/api/referrals.ts", "refer", "async function load()"],
  ];
  for (const [file, action, start] of calls) {
    const text = src(file);
    const at = text.indexOf(start);
    assert.ok(at >= 0, `${file} ${start}`);
    const body = text.slice(at, at + 1600);
    assert.match(body, new RegExp(`assertStaffAccountAction\\((context\\.userId|userId), "${action}"\\)`), `${file} ${start}`);
  }
  // Delete checks before any account change.
  const del = src("src/lib/server/family.ts");
  const d = del.indexOf("export const deleteAccount");
  assert.ok(del.indexOf('assertStaffAccountAction(context.userId, "delete")', d) < del.indexOf("revokeStoredAppleSignIn(uid)", d));
  assert.match(src("src/routes/api/referrals.ts"), /StaffAccountActionError\) return Response\.json\(\{ ok: false \}, \{ status: 403 \}\)/);
});

test("N-43: the Account page hides the sections from the server scope and never dead-ends", () => {
  const page = src("src/routes/account.tsx");
  assert.match(page, /getStaffAccountScope\(\),/);
  assert.match(page, /if \(accountSectionHiddenForStaff\(item\.id, staffScope\)\) return false;/);
  assert.match(page, /data-ke="account-staff-owner-only"[\s\S]{0,80}<OwnerOnlyNotice \/>/);
  for (const marker of [
    /section === "delete" && !staffBlockedSection/,
    /section === "export" && !staffBlockedSection/,
    /section === "wallet" && user && connect\.enabled && !staffBlockedSection/,
    /section === "refer" && user && !staffBlockedSection/,
    /section === "subscription" && !staffBlockedSection/,
  ]) {
    assert.match(page, marker);
  }
  // The owner-only note links back to Today.
  assert.match(src("src/components/owner-only-notice.tsx"), /data-ke="staff-owner-only-today"/);
});
