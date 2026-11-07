import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolvePostLoginPath } from "../src/lib/desks.ts";
import { destinationAfterSignIn } from "../src/lib/role-access.ts";

const index = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");

test("an opened home page does not replace itself after session restore", () => {
  assert.doesNotMatch(index, /homeLandPath/);
  assert.doesNotMatch(index, /data-ke-launch-hold/);
  assert.doesNotMatch(root, /launch-hold-boot/);
});

test("sign-in still honours next links and role desks", () => {
  assert.equal(resolvePostLoginPath({ next: "/search?city=Winnipeg", role: "provider" }), "/search?city=Winnipeg");
  assert.equal(resolvePostLoginPath({ role: "provider" }), "/provider");
  assert.equal(resolvePostLoginPath({ role: "parent", next: "/parent?tab=saved" }), "/parent?tab=saved");
  assert.equal(destinationAfterSignIn({ role: "government", next: "/" }), "/gov");
  assert.equal(destinationAfterSignIn({ role: "provider", next: "/daycare/e2e-centre" }), "/daycare/e2e-centre");
  assert.equal(destinationAfterSignIn({ role: "admin", next: "/admin" }), "/admin");
});
