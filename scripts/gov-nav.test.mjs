import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bottomBarKind, roleNavItems } from "../src/lib/role-access.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a government session is not given the parent tab bar", () => {
  assert.equal(bottomBarKind({ role: "government", pathname: "/", pending: false, highlightedDesk: null }), "government");
  assert.equal(bottomBarKind({ role: "government", pathname: "/search", pending: false, highlightedDesk: null }), "government");
  const items = roleNavItems({ role: "government" });
  assert.equal(items.some((item) => item.to === "/parent"), false);
  assert.equal(items.some((item) => item.to === "/inbox"), false);
  assert.equal(items.some((item) => item.to === "/admin"), false);
  assert.equal(items.some((item) => item.to === "/provider"), false);
  assert.equal(items.length, 5);
  assert.equal(items.some((item) => item.to === "/gov"), true);
});

test("government sign-in stays on the desk without a government banner on public browsing", () => {
  const login = read("src/components/gov/gov-login.tsx");
  const guard = read("src/lib/gov/desk-guard.ts");
  const shell = read("src/components/shell.tsx");
  const listing = read("src/routes/daycare.$slug.tsx");
  assert.match(login, /callbackURL: home/);
  assert.match(guard, /throw redirect\(\{ href: govClosedHome\(locale\) \}\)/);
  assert.doesNotMatch(shell, /data-ke="gov-public-browse"/);
  assert.match(shell, /chrome\.role === "government"/);
  assert.match(listing, /chrome\.role !== "government" && showPublicClaimPrompt/);
  assert.match(read("src/components/gov/gov-desk-nav.tsx"), /data-ke="gov-browse-public"/);
});
