import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { governmentHomePath, signOutTarget } from "../src/lib/sign-out-target.ts";
import { localePath } from "../src/lib/locale-path.ts";
import { govPath } from "../src/lib/gov/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("#1014 item 8: a French government user signs out to /fr/gov/login", () => {
  // The bug: localePath does not know /gov, so French officers got the English page.
  assert.equal(localePath("/gov/login", "fr"), "/gov/login");
  assert.equal(signOutTarget({ role: "government", pathname: "/fr/gov", locale: "fr" }), "/fr/gov/login");
  assert.equal(signOutTarget({ role: "government", pathname: "/fr/gov/centres", locale: "en" }), "/fr/gov/login");
  assert.equal(signOutTarget({ role: "government", pathname: "/account", locale: "fr" }), "/fr/gov/login");
  assert.equal(signOutTarget({ role: "government", pathname: "/gov", locale: "en" }), "/gov/login");
  // Same answer as the desk header button (gov-frame uses govPath(locale, "login")).
  assert.equal(signOutTarget({ role: "government", pathname: "/fr/gov", locale: "fr" }), govPath("fr", "login"));
  assert.match(src("src/components/gov/gov-frame.tsx"), /signOut\(govPath\(locale, "login"\)\)/);
});

test("#1014 item 8: everyone else goes home and keeps French", () => {
  assert.equal(signOutTarget({ role: "parent", pathname: "/fr/parent", locale: "fr" }), "/fr");
  assert.equal(signOutTarget({ role: "parent", pathname: "/fr/menu", locale: "en" }), "/fr");
  assert.equal(signOutTarget({ role: "provider", pathname: "/provider", locale: "en" }), "/");
  assert.equal(signOutTarget({ role: null, pathname: "/menu", locale: "en" }), "/");
});

test("#1014 item 8: the government desk home link keeps the language too", () => {
  assert.equal(governmentHomePath("/fr/gov/centres", "en"), "/fr/gov");
  assert.equal(governmentHomePath("/account", "fr"), "/fr/gov");
  assert.equal(governmentHomePath("/gov", "en"), "/gov");
});

test("#1014 item 8: header, app menu and phone menu all use the shared target", () => {
  assert.match(src("src/components/shell.tsx"), /onSignOut=\{\(\) => void signOut\(signOutTarget\(\{ role: chrome\.role, pathname, locale \}\)\)\}/);
  assert.doesNotMatch(src("src/components/shell.tsx"), /localePath\("\/gov/);
  assert.match(src("src/components/app-menu-screen.tsx"), /signOut\(signOutTarget\(\{ role: chrome\.role, pathname, locale \}\)\)/);
  assert.match(src("src/components/phone-category-menu.tsx"), /signOut\(signOutTarget\(\{ role: chrome\.role, pathname, locale \}\)\)/);
  assert.doesNotMatch(src("src/components/app-tab-bar.tsx"), /localePath\("\/gov"/);
});
