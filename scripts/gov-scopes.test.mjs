import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { govScopesEnabled } from "../src/lib/features.ts";
import { govScopeView, normalizeGovProvince, rowsInProvince, summarizeProvince } from "../src/lib/gov-scopes.ts";
import { PROVINCES } from "../src/lib/gov/places.ts";
import { guardPrivatePath } from "../src/lib/role-access.ts";

const rows = [
  { province: "MB", openSpots: 2, name: "Hidden" },
  { province: "ON", openSpots: 9, name: "Also hidden" },
  { province: "mb", openSpots: 1 },
];

test("government scopes default off and do not drop the account", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_GOV_SCOPES, false);
  assert.equal(govScopesEnabled({}), false);
  assert.deepEqual(govScopeView({ actor: { province: "MB", national: false }, enabled: false }), {
    show: true,
    reason: "off",
    province: null,
  });
  assert.equal(govScopeView({ enabled: true }).show, false);
  assert.equal(govScopeView({ role: "government", govProvince: "MB", enabled: true }).show, false);
});

test("a government user only keeps their province", () => {
  assert.deepEqual(govScopeView({ actor: { province: "mb", national: false }, enabled: true }), {
    show: true,
    reason: "ok",
    province: "MB",
  });
  assert.equal(govScopeView({ actor: { province: "", national: false }, enabled: true }).reason, "missing");
  const mine = rowsInProvince(rows, "MB");
  assert.equal(mine.length, 2);
  assert.ok(mine.every((row) => String(row.province).toUpperCase() === "MB"));
  assert.deepEqual(summarizeProvince(rows, "MB"), { province: "MB", centres: 2, openSpots: 3 });
  assert.equal(JSON.stringify(summarizeProvince(rows, "ON")).includes("Hidden"), false);
});

test("legacy totals accept only actual provinces and do not invent a national aggregate", () => {
  for (const { code } of PROVINCES) assert.equal(normalizeGovProvince(` ${code.toLowerCase()} `), code);
  for (const value of ["US", "CA", "ALL", "ZZ", "Ontario", ""]) assert.equal(normalizeGovProvince(value), null);
  assert.deepEqual(govScopeView({ actor: { province: "ALL", national: true }, enabled: true }), {
    show: true, reason: "unsupported", province: null,
  });
  assert.deepEqual(rowsInProvince([{ province: "US", openSpots: 100 }], "US"), []);
});

test("the ordinary Account stops requesting government totals and retains government isolation", () => {
  const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(source("src/routes/account.tsx"), /GovernmentScopeCard|loadGovScope/);
  assert.doesNotMatch(source("src/components/gov/gov-dashboard.tsx"), /GovernmentScopeCard/);
  assert.deepEqual(guardPrivatePath({ pathname: "/account", signedIn: true, role: "government" }), {
    kind: "home", to: "/gov",
  });
  const card = source("src/components/government-scope-card.tsx");
  assert.match(card, /data\.reason === "unsupported"/);
  assert.match(card, /data\.reason === "unavailable"/);
  assert.doesNotMatch(card, /not on yet|coming soon/i);
});
