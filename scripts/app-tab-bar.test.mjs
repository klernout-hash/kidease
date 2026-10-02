import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("app tab bar always renders the same five lucide icons, including on Menu", () => {
  const bar = src("src/components/app-tab-bar.tsx");
  const lite = src("src/components/shell-lite.tsx");
  const shell = src("src/components/shell.tsx");
  const menu = src("src/routes/menu.tsx");

  assert.match(bar, /icon=\{Search\}/);
  assert.match(bar, /icon=\{Heart\}/);
  assert.match(bar, /icon=\{ClipboardCheck\}/);
  assert.match(bar, /icon=\{MessageCircle\}/);
  assert.match(bar, /icon=\{Home\}/);
  assert.match(bar, /icon=\{Building2\}/);
  assert.match(bar, /icon=\{ClipboardList\}/);
  assert.match(bar, /icon=\{LifeBuoy\}/);
  assert.match(bar, /t\("todayHome"\)/);
  assert.match(bar, /t\("deskNavListings"\)/);
  assert.match(bar, /t\("navHome"\)/);
  assert.match(bar, /t\("navRequestsShort"\)/);
  assert.match(bar, /t\("navReview"\)/);
  assert.match(bar, /t\("signIn"\)/);
  assert.match(bar, /search=\{\{ tab: "queue" \}\}/);
  assert.match(bar, /search=\{\{ tab: "verify" \}\}/);
  assert.match(bar, /search=\{\{ tab: "mail" \}\}/);
  assert.doesNotMatch(bar, /navImParent/);
  assert.doesNotMatch(bar, /navImDaycare/);
  assert.match(bar, /bottomBarKind/);
  assert.doesNotMatch(bar, /label="Desk"[\s\S]{0,80}icon=\{Search\}/);
  assert.doesNotMatch(bar, /label=\{t\("enrolled"\)\}/);
  assert.match(bar, /className="size-5 shrink-0"/);
  assert.match(bar, /data-ke="app-tab-bar"/);
  assert.match(bar, /data-ke="app-tab"/);
  assert.match(bar, /active \? "text-primary" : "text-muted"/);

  assert.match(lite, /<AppTabBar \/>/);
  assert.doesNotMatch(lite, /MenuAppTabs/);
  assert.doesNotMatch(lite, /place-items-center">\s*Search/);
  assert.match(menu, /<ShellLite appTabs>/);

  assert.match(shell, /<AppTabBar \/>/);
  assert.doesNotMatch(shell, /function Tab\(/);
});
