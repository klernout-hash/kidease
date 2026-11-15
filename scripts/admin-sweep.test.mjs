import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { onboardingPlace } from "../src/lib/first-run.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("the admin desk does not auto-start the parent tour", () => {
  const place = onboardingPlace({ pathname: "/admin", desk: "queue" });
  assert.equal(place.welcome, null);
  assert.equal(place.tour, null);
  assert.equal(place.checklist, null);
});

test("the tour scrim does not block the parent-view link", () => {
  const tour = src("src/components/first-run.tsx");
  assert.match(tour, /data-ke="first-run-scrim"[^>]*pointer-events-none|pointer-events-none[^>]*data-ke="first-run-scrim"/);
  assert.match(tour, /data-ke="coach-scrim"/);
  assert.match(tour, /pointer-events-none fixed inset-0 z-\[66\]/);
  assert.match(tour, /pointer-events-auto/);
});

test("support waits for the desk list instead of saying not found", () => {
  const page = src("src/routes/support.tsx");
  assert.match(page, /data-ke="support-opening"/);
  const denied = page.indexOf("profiles.role = admin");
  const opening = page.indexOf("support-opening");
  assert.ok(opening > 0 && opening < denied);
});

test("admin nav labels have French keys and the built money tools are linked", () => {
  const nav = src("src/lib/desk-nav.ts");
  for (const key of [
    "adminNavVerify",
    "adminNavReviews",
    "adminNavScreening",
    "adminNavRegistries",
    "adminNavTrustQueue",
    "adminNavDaycares",
    "adminNavPeople",
    "adminNavBills",
    "adminNavContracts",
    "adminNavActivity",
    "adminNavEmailHealth",
  ]) {
    assert.match(nav, new RegExp(key));
    assert.match(src("src/lib/copy-fr.ts"), new RegExp(`${key}:`));
  }
  assert.match(nav, /adminNavConnect/);
  assert.match(nav, /adminNavQuickBooks/);
  assert.match(nav, /desk: "money"/);
  assert.match(nav, /adminNavPayroll/);
  assert.match(nav, /adminNavSubsidy/);
  assert.match(src("src/lib/server/admin-tools.ts"), /AI_TRUTH_CHECKER/);
  assert.match(src("src/lib/server/admin-tools.ts"), /AI_SPAM_FILTER/);
});
