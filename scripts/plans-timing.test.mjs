import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { roleNavItems } from "../src/lib/role-access.ts";
import { FOOTER_KIDEASE } from "../src/lib/site-footer-nav.ts";
import {
  daycareCapPrompt,
  daycareHomeCardEligible,
  parentHomeCardEligible,
  plansAudience,
  showHomeUpgradeCard,
} from "../src/lib/upgrade-prompt.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("guests do not see pricing on the public home", () => {
  const home = src("src/routes/index.tsx");
  assert.doesNotMatch(home, /OptionalUpgrades|optional-upgrades|HomeUpgrades|showPayCtas\(/);
  assert.doesNotMatch(home, /\$59|\$490|Parent Plus|KidEase is free/);
  assert.match(src("src/routes/plans.tsx"), /OptionalUpgrades/);
  assert.match(src("src/routes/plans.tsx"), /createFileRoute\("\/plans"\)/);
  assert.doesNotMatch(src("src/lib/role-access.ts"), /pathname === "\/plans"|startsWith\("\/plans"\)/);
});

test("guests reach plans from the main menu and the footer", () => {
  const plans = roleNavItems({ role: "guest" }).find((item) => item.id === "plans");
  assert.equal(plans?.label, "Subscription");
  assert.equal(plans?.to, "/plans");
  assert.equal(roleNavItems({ role: "parent" }).some((item) => item.id === "plans"), false);
  assert.equal(roleNavItems({ role: "provider" }).some((item) => item.id === "upgrade"), true);
  assert.ok(FOOTER_KIDEASE.some((link) => link.to === "/plans" && link.labelKey === "navPlans"));
  assert.match(src("src/components/role-nav.tsx"), /plans: "navPlans"/);
  assert.match(src("src/lib/copy.ts"), /navPlans: "Subscription"/);
  assert.match(src("src/lib/copy.ts"), /navPlans: "Abonnement"/);
});

test("home upgrade card waits for a real action and stays hidden after dismissal", () => {
  assert.equal(parentHomeCardEligible({ requests: 0, messages: 0 }), false);
  assert.equal(parentHomeCardEligible({ requests: 1, messages: 0 }), true);
  assert.equal(parentHomeCardEligible({ requests: 0, messages: 1 }), true);
  assert.equal(daycareHomeCardEligible({ claimed: false, listingReady: false }), false);
  assert.equal(daycareHomeCardEligible({ claimed: true, listingReady: false }), true);
  assert.equal(daycareHomeCardEligible({ claimed: false, listingReady: true }), true);

  assert.equal(showHomeUpgradeCard({ paid: false, eligible: false, dismissed: false }), null);
  assert.equal(showHomeUpgradeCard({ paid: false, eligible: true, dismissed: false }), "upgrade");
  assert.equal(showHomeUpgradeCard({ paid: false, eligible: true, dismissed: true }), null);
  assert.equal(showHomeUpgradeCard({ paid: true, eligible: false, dismissed: true }), "plan");

  assert.match(src("src/components/parent-home.tsx"), /showHomeUpgradeCard/);
  assert.match(src("src/components/daycare-desk-home.tsx"), /showHomeUpgradeCard/);
  assert.match(src("src/components/role-upgrade-card.tsx"), /data-ke="upgrade-card-dismiss"/);
  assert.match(src("migrations/0067_upgrade_card_dismiss.sql"), /upgrade_card_dismissed_at/);
  assert.match(src("src/lib/server/upgrade-card.ts"), /upgrade_card_dismissed_at = now\(\)/);
  for (const file of ["src/components/parent-desk.tsx", "src/routes/provider.tsx"]) {
    const desk = src(file);
    assert.match(desk, /dismissUpgradeCard\(\)\s*\.then\(\(\) => setUpgradeDismissed\(true\)\)/, file);
    assert.doesNotMatch(desk, /setUpgradeDismissed\(true\);\s*void dismissUpgradeCard/, file);
  }
  assert.match(src("scripts/e2e-smoke.mjs"), /upgrade-card-dismiss[\s\S]*state: "hidden"/);
  assert.doesNotMatch(src("src/components/role-upgrade-card.tsx"), /sessionStorage|Dialog|role="dialog"/);
});

test("daycare cap prompt shows near the free monthly limit and when it is hit", () => {
  assert.equal(daycareCapPrompt(0, 10), null);
  assert.equal(daycareCapPrompt(7, 10), null);
  assert.equal(daycareCapPrompt(8, 10), "near");
  assert.equal(daycareCapPrompt(9, 10), "near");
  assert.equal(daycareCapPrompt(10, 10), "at");
  assert.equal(daycareCapPrompt(12, 10), "at");
  assert.equal(daycareCapPrompt(8, null), null);
  assert.match(src("src/components/daycare-desk-home.tsx"), /data-ke="daycare-cap-prompt"/);
  assert.match(src("src/components/provider-plan-banner.tsx"), /daycareCapPrompt/);
  assert.doesNotMatch(src("src/components/daycare-desk-home.tsx"), /UpgradeToProLink/);
});

test("plans page and video prompt stay on the right role", () => {
  assert.equal(plansAudience("guest"), "both");
  assert.equal(plansAudience("parent"), "parent");
  assert.equal(plansAudience("provider"), "daycare");
  assert.equal(plansAudience("admin"), "both");
  const video = src("src/routes/video.$roomId.tsx");
  assert.match(video, /data-ke="parent-plus-prompt"/);
  assert.match(video, /paywall \?/);
  assert.doesNotMatch(src("src/components/parent-home.tsx"), /parent-plus-prompt/);
  assert.match(src("src/routes/plans.tsx"), /Canadian dollars/);
});
