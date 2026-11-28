import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bottomBarKindInShell } from "../src/lib/native-admin.ts";
import { nativeStoreTabs } from "../src/lib/native-store-tabs.ts";
import { bottomBarKind } from "../src/lib/role-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("native guest, parent, and provider tabs are the role bar, not an empty store list", () => {
  const cases = [
    ["guest", "/search", "guest"],
    ["parent", "/search", "parent"],
    ["provider", "/provider", "daycare"],
  ];
  for (const [role, pathname, expected] of cases) {
    const kind = bottomBarKindInShell(
      bottomBarKind({ role, pathname, pending: false, highlightedDesk: null }),
      true,
    );
    assert.equal(kind, expected, role);
    assert.equal(nativeStoreTabs(kind), null, role);
  }
  const adminKind = bottomBarKindInShell(
    bottomBarKind({ role: "admin", pathname: "/search", pending: false, highlightedDesk: "admin" }),
    true,
  );
  assert.equal(adminKind, "parent");
});

test("the tab bar is one frosted bar and the cookie sheet stays under it", () => {
  const bar = read("src/components/app-tab-bar.tsx");
  const css = read("src/styles.css");
  assert.equal((bar.match(/data-ke="app-tab-bar"/g) ?? []).length, 1);
  assert.match(bar, /data-nav=\{marker\}/);
  assert.match(bar, /marker="search"/);
  assert.match(bar, /marker="saved"/);
  assert.match(bar, /marker="menu"/);
  assert.match(bar, /marker="bookings"/);
  assert.match(bar, /marker="messages"/);
  assert.match(bar, /marker="today"/);
  assert.match(bar, /marker="listings"/);
  assert.doesNotMatch(bar, /backdrop-blur/);
  assert.doesNotMatch(bar, /bg-surface\/95/);
  assert.doesNotMatch(bar, /pb-\[env\(safe-area-inset-bottom\)\]/);
  const tabAt = css.indexOf('[data-ke="app-tab-bar"] {');
  const tabRule = css.slice(tabAt, css.indexOf("}", tabAt));
  assert.match(tabRule, /background:\s*color-mix\(in srgb, var\(--color-surface\) 82%, transparent\)/);
  assert.match(tabRule, /backdrop-filter:\s*blur\(16px\) saturate\(180%\)/);
  assert.match(tabRule, /border-top:\s*1px solid var\(--ke-hairline\)/);
  assert.match(tabRule, /z-index:\s*50/);
  assert.doesNotMatch(tabRule, /backdrop-filter:\s*none/);
  assert.match(css, /html\[data-native="1"\] \.ke-site-footer/);
  assert.match(css, /html\[data-runtime="native"\] \.ke-site-footer/);
  assert.doesNotMatch(css, /html\[data-native="1"\] \[data-ke="cookie-consent"\]/);
  assert.match(read("src/routes/__root.tsx"), /<CookieConsentBanner \/>\s*<Outlet \/>/);
});

test("sign out and delete account are on Menu, the account screen, and the account drawer", () => {
  const menu = read("src/components/app-menu-screen.tsx");
  const account = read("src/routes/account.tsx");
  const drawer = read("src/components/nav-drawer.tsx");
  assert.match(menu, /data-ke="menu-sign-out"/);
  assert.match(menu, /data-ke="menu-delete-account"/);
  assert.match(menu, /signOut\(signOutTarget\(\{ role: chrome\.role, pathname, locale \}\)\)/);
  assert.match(menu, /localePath\("\/delete-account"/);
  assert.match(account, /data-ke="account-sign-out"/);
  assert.match(account, /data-ke=\{`account-section-\$\{item\.id\}`\}/);
  assert.match(account, /id: "delete"/);
  assert.ok(account.indexOf('id: "delete"') < account.indexOf('id: "alerts"'));
  assert.match(drawer, /data-ke="drawer-sign-out"/);
  assert.match(drawer, /data-ke="drawer-delete-account"/);
  assert.match(drawer, /onSignOut\(\)/);
});
