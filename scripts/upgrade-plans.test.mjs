import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PLUS_FEATURES } from "../src/lib/parent-plus.ts";
import {
  DAYCARE_UPGRADE_PLANS,
  PARENT_UPGRADE_PLANS,
  daycareUpgradePlan,
  parentUpgradePlan,
  paidPlanVisible,
  yearlySavingsCad,
  yearlySavingsPercent,
} from "../src/lib/upgrade-plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("each role has one recommended plan and only real benefits", () => {
  assert.equal(PARENT_UPGRADE_PLANS.filter((plan) => plan.recommended).map((plan) => plan.id).join(), "plus");
  assert.equal(DAYCARE_UPGRADE_PLANS.filter((plan) => plan.recommended).map((plan) => plan.id).join(), "pro");
  assert.equal(daycareUpgradePlan("network").recommended, false);

  assert.equal(
    parentUpgradePlan("free").pitch.en,
    "Free forever. Everything you need to find and connect",
  );
  const plus = parentUpgradePlan("plus").benefits.map((line) => line.en).join(" | ");
  assert.match(plus, /video tour, when video is on/);
  assert.equal(parentUpgradePlan("plus").benefits.length, 1);
  assert.equal(PLUS_FEATURES.map((line) => line.en).join(" | "), plus);
  assert.doesNotMatch(plus, /saved-search|priority support|early access|peace of mind|enrol/i);

  const pro = daycareUpgradePlan("pro").benefits.map((line) => line.en);
  assert.deepEqual(pro, [
    "Unlimited messages and tours",
    "One featured city in search",
    "90 days of views and requests",
  ]);
  const network = daycareUpgradePlan("network").benefits.map((line) => line.en).join(" | ");
  assert.match(network, /Totals across your sites/);
  assert.doesNotMatch(network, /featured city/i);
  assert.equal(yearlySavingsCad(7.99, 59), 36.88);
  assert.equal(yearlySavingsCad(49, 490), 98);
  assert.equal(yearlySavingsCad(39, 390), 78);
  assert.equal(yearlySavingsPercent(7.99, 59), 38);
  assert.equal(yearlySavingsPercent(49, 490), 16);
  assert.equal(yearlySavingsPercent(39, 390), 16);
  assert.equal(yearlySavingsPercent(14.99, 149), 17);
  assert.equal(PARENT_UPGRADE_PLANS.filter((plan) => plan.id !== "free").length, 2);
  assert.equal(DAYCARE_UPGRADE_PLANS.filter((plan) => plan.id !== "free").length, 2);
  assert.equal(paidPlanVisible("alerts", "year", {}), false);
  assert.equal(paidPlanVisible("alerts", "month", { parent_alerts_monthly: true }), false);
  assert.equal(
    paidPlanVisible("alerts", "year", { parent_alerts_monthly: true, parent_alerts_yearly: true }),
    true,
  );
  assert.equal(paidPlanVisible("network", "year", { network_monthly: true }), false);
  assert.equal(paidPlanVisible("network", "month", { network_monthly: true }), true);
  const alerts = parentUpgradePlan("alerts").benefits.map((line) => line.en).join(" | ");
  assert.match(alerts, /when SMS is on/);
  assert.match(alerts, /when push is on/);
  assert.doesNotMatch(alerts, /priority support|early access|peace of mind|enrol/i);

  const parentUi = src("src/components/parent-plus.tsx");
  assert.match(parentUi, /parent-upgrade-plans/);
  assert.match(parentUi, /BillingIntervalToggle/);
  assert.match(parentUi, /paidPlanVisible/);
  assert.doesNotMatch(parentUi, /PROVIDER_PLANS|featured city/);
  const daycareUi = src("src/components/provider-subscription.tsx");
  assert.match(daycareUi, /UpgradePlanCard/);
  assert.match(daycareUi, /daycareUpgradePlan/);
  assert.match(daycareUi, /not parent Plus/);
  const home = src("src/components/optional-upgrades.tsx");
  assert.match(home, /For families/);
  assert.match(home, /For daycares/);
  assert.match(home, /PARENT_UPGRADE_PLANS/);
  assert.match(home, /DAYCARE_UPGRADE_PLANS/);
  assert.match(src("src/components/admin-stripe-catalog.tsx"), /admin-plan-benefits/);
  assert.doesNotMatch(src("src/lib/server/stripe-catalog.ts"), /priority support|saved-search alerts/);
});
