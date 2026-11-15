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
  assert.match(tour, /pointer-events-none fixed inset-0 z-\[60\]" data-ke="first-run-scrim"/);
  assert.match(tour, /aria-modal="false"/);
  assert.match(tour, /pointer-events-auto fixed/);
  assert.match(tour, /marker="coach-tour"/);
});

test("support waits for the desk list instead of saying not found", () => {
  const page = src("src/routes/support.tsx");
  assert.match(page, /data-ke="support-opening"/);
  const denied = page.indexOf("profiles.role = admin");
  const opening = page.indexOf("support-opening");
  assert.ok(opening > 0 && opening < denied);
});

test("support sends a signed-out visitor to sign-in before the loading shell", () => {
  const gate = src("src/lib/server/support-route.ts");
  assert.match(gate, /raw === "Unauthorized"/);
  assert.match(gate, /to: dest\.startsWith\("\/fr\/"\) \? "\/fr\/login" : "\/login"/);
  assert.match(gate, /next: dest/);
  const page = src("src/routes/security.tsx");
  assert.match(page, /Security · KidEase/);
  assert.match(src("src/components/security-page.tsx"), /Accueil/);
  assert.match(src("src/components/security-page.tsx"), /to=\{fr \? "\/fr" : "\/"\}/);
  const sitemap = src("public/sitemap.xml");
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/how-it-works</);
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/forgot-password</);
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/security</);
  assert.doesNotMatch(sitemap, /https:\/\/www\.kidease\.ca\/plans</);
  assert.doesNotMatch(sitemap, /https:\/\/www\.kidease\.ca\/fr\/plans</);
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
