import assert from "node:assert/strict";
import { test } from "node:test";
import { AXE_PAGES, blockingViolations, listingPathFromHref } from "./a11y-axe-lib.mjs";

test("axe covers the key pages in English and French", () => {
  const paths = AXE_PAGES.map((item) => item.path);
  for (const path of ["/", "/fr", "/login", "/fr/login", "/signup", "/fr/signup", "/account", "/fr/account", "/provider", "/fr/provider", "/parent", "/fr/parent"]) {
    assert.ok(paths.includes(path), path);
  }
});

test("only serious and critical axe results block", () => {
  const blocked = blockingViolations([
    { id: "color-contrast", impact: "serious" },
    { id: "button-name", impact: "critical" },
    { id: "region", impact: "moderate" },
    { id: "note", impact: "minor" },
  ]);
  assert.deepEqual(blocked.map((item) => item.id), ["color-contrast", "button-name"]);
});

test("listing links stay on a centre page", () => {
  assert.equal(listingPathFromHref("/daycare/centre-one"), "/daycare/centre-one");
  assert.equal(listingPathFromHref("/daycare/city/winnipeg"), null);
  assert.equal(listingPathFromHref("https://www.kidease.ca/daycare/centre-one?x=1"), "/daycare/centre-one");
});
