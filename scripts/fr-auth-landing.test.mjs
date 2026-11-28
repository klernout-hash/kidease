import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { destinationAfterSignIn } from "../src/lib/role-access.ts";
import { signOutTarget } from "../src/lib/sign-out-target.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("French sign-in lands on the French desk, even when next is the English default", () => {
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/parent", locale: "fr" }), "/fr/parent");
  assert.equal(destinationAfterSignIn({ role: "parent", locale: "fr" }), "/fr/parent");
  assert.equal(destinationAfterSignIn({ role: "provider", next: "/provider", locale: "fr" }), "/fr/provider");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/fr/parent", locale: "fr" }), "/fr/parent");
  assert.equal(
    destinationAfterSignIn({ role: "parent", next: "/parent", ownsCentre: true, locale: "fr" }),
    "/fr/provider",
  );
});

test("English sign-in is unchanged", () => {
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/parent", locale: "en" }), "/parent");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/parent" }), "/parent");
  assert.equal(destinationAfterSignIn({ role: "provider", locale: "en" }), "/provider");
});

test("every login continue passes the sign-in language", () => {
  const login = read("src/routes/login.tsx");
  assert.match(login, /const authLocale: "en" \| "fr" = loginPath === "\/fr\/login" \|\| locale === "fr" \? "fr" : "en";/);
  const calls = login.split("continueAfterSignIn({").slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("})")));
  assert.ok(calls.length >= 4);
  for (const call of calls) assert.match(call, /locale: (authLocale|signInLocale)/);
  const signup = read("src/components/parent-signup-form.tsx");
  assert.match(signup, /locale: locale === "fr" \? "fr" : "en",/);
});

test("French sign-out goes to /fr/login from the account page and the app menu (N-37)", () => {
  assert.equal(signOutTarget({ role: "parent", pathname: "/fr/account", locale: "fr" }), "/fr/login");
  assert.equal(signOutTarget({ role: "parent", pathname: "/fr/parent", locale: "fr" }), "/fr/login");
  assert.equal(signOutTarget({ role: "parent", pathname: "/account", locale: "en" }), "/login");
  const account = read("src/routes/account.tsx");
  assert.doesNotMatch(account, /signOut\("\/"\)/);
  assert.match(account, /signOut\(signOutTarget\(\{ role: chrome\.role, pathname, locale \}\)\)/);
  const airbnb = read("src/components/airbnb-screens.tsx");
  assert.match(airbnb, /signOut\(signedOutLoginPath\(locale === "fr" \? "fr" : "en"\)\)/);
});
