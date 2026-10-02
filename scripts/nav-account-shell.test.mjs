import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ACCOUNT_RESTORE_DAYS, DELETE_CONFIRM_PHRASE, withinRestoreWindow } from "../src/lib/account-delete.ts";
import { attentionForItem, attentionTotal, formatAttention } from "../src/lib/attention.ts";
import { DESK_NAV } from "../src/lib/desk-nav.ts";
import { showDeskSwitcher, desksFor } from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("attention badges hide at 0 and cap at 99+", () => {
  assert.equal(formatAttention(0), null);
  assert.equal(formatAttention(-3), null);
  assert.equal(formatAttention(1), "1");
  assert.equal(formatAttention(99), "99");
  assert.equal(formatAttention(120), "99+");
  const counts = { messages: 2, notifications: 0, requests: 4, signups: 1, reviews: 0, claims: 3 };
  assert.equal(attentionForItem(counts, "messages"), 2);
  assert.equal(attentionForItem(counts, "notifications"), 0);
  assert.equal(attentionForItem(counts, "bookings"), 4);
  assert.equal(attentionTotal(counts, ["messages", "bookings", "requests"]), 6);
  assert.equal(attentionTotal(counts), 10);
});

test("desk switcher is admin or multi-role only, and parent Home stays on /parent", () => {
  assert.equal(showDeskSwitcher(desksFor({ role: "parent" }), "parent", "parent@example.com"), false);
  assert.equal(showDeskSwitcher(desksFor({ role: "provider" }), "provider", "director@example.com"), false);
  assert.equal(showDeskSwitcher(desksFor({ role: "parent", ownsCentre: true }), "parent", "parent@example.com"), true);
  assert.equal(showDeskSwitcher(desksFor({ role: "admin" }), "admin", "kyle@kidease.ca"), true);
  assert.equal(DESK_NAV.parent.find((item) => item.id === "explore")?.href, "/parent");
  assert.equal(ACCOUNT_RESTORE_DAYS, 30);
  assert.equal(DELETE_CONFIRM_PHRASE, "DELETE");
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(withinRestoreWindow(recent), true);
  assert.equal(withinRestoreWindow(old), false);
});

test("delete confirmation and avatar live in the account shell", () => {
  const account = src("src/routes/account.tsx");
  const panel = src("src/components/delete-account-panel.tsx");
  const shell = src("src/components/shell.tsx");
  const bar = src("src/components/app-tab-bar.tsx");
  assert.match(account, /data-ke="account-delete"/);
  assert.match(account, /account-section-\$\{item\.id\}/);
  assert.match(panel, /data-ke="delete-confirm"/);
  assert.match(panel, /DELETE_CONFIRM_PHRASE/);
  assert.match(shell, /data-ke="header-avatar"/);
  assert.match(shell, /data-ke="menu-badge"|marker="menu-badge"/);
  assert.match(bar, /data-ke="tab-avatar"/);
  assert.doesNotMatch(bar, /CreditCard/);
  assert.doesNotMatch(src("src/components/parent-desk.tsx"), /delete-account/);
});
