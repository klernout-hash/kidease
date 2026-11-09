import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { admissionsRedirectPath } from "../src/lib/admissions-forward.ts";
import { ghostClaimLabCentre, isGhostClaimLabRow, withGhostClaimLab } from "../src/lib/admin-ghost-fixture.ts";
import { staffQueueRows } from "../src/lib/listing-visibility.ts";
import { alertSettingRows } from "../src/lib/alert-push.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admissions leaves the URL for the signed-in desk", () => {
  assert.equal(
    admissionsRedirectPath({ pathname: "/admissions", role: "parent", signedIn: true }),
    "/parent?tab=waitlists",
  );
  assert.equal(
    admissionsRedirectPath({ pathname: "/admissions", role: "provider", signedIn: true }),
    "/provider?desk=requests",
  );
  assert.equal(
    admissionsRedirectPath({ pathname: "/fr/admissions", role: "provider", signedIn: true }),
    "/fr/provider?desk=requests",
  );
  assert.match(admissionsRedirectPath({ pathname: "/admissions", role: null, signedIn: false }), /^\/login\?/);
  assert.equal(admissionsRedirectPath({ pathname: "/search", role: "parent", signedIn: true }), null);
  const server = read("src/server.ts");
  assert.match(server, /admissionsRedirect/);
  assert.match(server, /302/);
});

test("government filters reload from the dropdown search", () => {
  const gov = read("src/routes/gov.tsx");
  assert.match(gov, /loaderDeps:/);
  assert.match(gov, /deps\.city/);
  const dash = read("src/components/gov/gov-dashboard.tsx");
  assert.match(dash, /regionForCity\(city\)/);
  assert.doesNotMatch(dash, /Population per licensed space/);
  assert.doesNotMatch(dash, /total population per licensed space/);
  const copy = read("src/lib/gov/copy.ts");
  assert.doesNotMatch(copy, /Kyle names/);
  assert.match(copy, /98-10-0666/);
  assert.match(dash, /data-ke="gov-child-ratio"/);
});

test("the ghost claim lab stays unpublished until Show QA is on", () => {
  const ghost = ghostClaimLabCentre();
  assert.equal(ghost.live, false);
  assert.equal(ghost.isTest, true);
  assert.equal(isGhostClaimLabRow(ghost), true);
  const hidden = staffQueueRows(withGhostClaimLab([]), false);
  assert.equal(hidden.some((row) => isGhostClaimLabRow(row)), false);
  const shown = staffQueueRows(withGhostClaimLab([]), true);
  assert.equal(shown.some((row) => row.name === "TEST Ghost Claim Lab"), true);
  const page = read("src/components/admin-desk-page.tsx");
  assert.match(page, /writeQaFixtureToggle/);
  assert.match(page, /withGhostClaimLab/);
});

test("admin alert settings use admin labels and stay nine", () => {
  const rows = alertSettingRows("admin", "en", false);
  assert.equal(rows.length, 9);
  assert.equal(rows.some((row) => row.label === "Spot opened"), false);
  assert.equal(rows.some((row) => row.label === "Waitlist moves"), false);
  assert.equal(rows.some((row) => row.label === "Visits and tours"), false);
  assert.equal(rows.some((row) => row.label === "Licence or screening"), false);
  assert.equal(rows.some((row) => row.label === "Family waitlist changes"), true);
  assert.equal(rows.some((row) => row.label === "Visit bookings"), true);
  assert.equal(rows.some((row) => row.label === "Stored licence changes"), true);
  assert.match(read("src/routes/account.tsx"), /desk === "admin" \? "admin"/);
});
