import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { govScopesEnabled } from "../src/lib/features.ts";
import { govScopeView, rowsInProvince, summarizeProvince } from "../src/lib/gov-scopes.ts";

const rows = [
  { province: "MB", openSpots: 2, name: "Hidden" },
  { province: "ON", openSpots: 9, name: "Also hidden" },
  { province: "mb", openSpots: 1 },
];

test("government scopes default off and do not drop the account", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_GOV_SCOPES, false);
  assert.equal(govScopesEnabled({}), false);
  assert.deepEqual(govScopeView({ role: "government", govProvince: "MB", enabled: false }), {
    show: true,
    reason: "off",
    province: null,
  });
  assert.equal(govScopeView({ role: "parent", govProvince: "MB", enabled: true }).show, false);
});

test("a government user only keeps their province", () => {
  assert.deepEqual(govScopeView({ role: "government", govProvince: "mb", enabled: true }), {
    show: true,
    reason: "ok",
    province: "MB",
  });
  assert.equal(govScopeView({ role: "government", govProvince: "", enabled: true }).reason, "missing");
  const mine = rowsInProvince(rows, "MB");
  assert.equal(mine.length, 2);
  assert.ok(mine.every((row) => String(row.province).toUpperCase() === "MB"));
  assert.deepEqual(summarizeProvince(rows, "MB"), { province: "MB", centres: 2, openSpots: 3 });
  assert.equal(JSON.stringify(summarizeProvince(rows, "ON")).includes("Hidden"), false);
});
