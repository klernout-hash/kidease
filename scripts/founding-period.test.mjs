import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { foundingBadgeEnabled, subscriptionsEnabled } from "../src/lib/features.ts";
import {
  FOUNDING_FREE_FEATURES,
  FOUNDING_PAGE,
  PROTECTED_LISTING_ID,
  foundingMemberVisible,
} from "../src/lib/founding-period.ts";
import {
  applyFoundingPeriodEntitlements,
  resolveProviderEntitlements,
} from "../src/lib/provider-entitlements.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("subscriptions stay off and the founding badge stays on by default", () => {
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(FLAG_DEFAULTS.FOUNDING_BADGE_ENABLED, true);
  assert.equal(subscriptionsEnabled({}), false);
  assert.equal(subscriptionsEnabled({ SUBSCRIPTIONS_ENABLED: "0" }), false);
  assert.equal(subscriptionsEnabled({ SUBSCRIPTIONS_ENABLED: "1" }), true);
  assert.equal(foundingBadgeEnabled({}), true);
  assert.equal(foundingBadgeEnabled({ FOUNDING_BADGE_ENABLED: "0" }), false);
});

test("founding copy names the free tier and does not invent a paid price", () => {
  const blob = JSON.stringify(FOUNDING_PAGE) + JSON.stringify(FOUNDING_FREE_FEATURES);
  assert.match(FOUNDING_PAGE.en.daycarePill, /Free founding period/);
  assert.match(FOUNDING_PAGE.fr.daycarePill, /Période fondatrice gratuite/);
  assert.match(FOUNDING_PAGE.fr.parentsBody, /5 centres/);
  assert.doesNotMatch(blob, /toujours|gratuit pour toujours/i);
  assert.match(FOUNDING_PAGE.en.foundingBody, /locked-in discount when paid extras arrive/);
  assert.match(FOUNDING_PAGE.en.lead, /Canadian company/);
  assert.match(blob, /Claimed listing/);
  assert.match(blob, /Open-spot posting/);
  assert.match(blob, /Basic waitlist/);
  assert.doesNotMatch(blob, /free forever/i);
  assert.doesNotMatch(blob, /winnipeg/i);
  assert.doesNotMatch(blob, /—/);
  assert.doesNotMatch(blob, /\$49|\$39|\$7\.99|GST/i);
  for (const feature of FOUNDING_FREE_FEATURES) {
    assert.ok(feature.fr.length > feature.en.length * 0.5);
  }
});

test("founding badge follows the flag and skips the protected listing", () => {
  assert.equal(foundingMemberVisible({ id: "d_1", foundingMember: true, badgeEnabled: true }), true);
  assert.equal(foundingMemberVisible({ id: "d_1", foundingMember: true, badgeEnabled: false }), false);
  assert.equal(foundingMemberVisible({ id: "d_1", foundingMember: false, badgeEnabled: true }), false);
  assert.equal(
    foundingMemberVisible({ id: PROTECTED_LISTING_ID, foundingMember: true, badgeEnabled: true }),
    false,
  );
});

test("founding period unlocks daycare tools and does not grant a search pin", () => {
  const base = resolveProviderEntitlements({
    plan: "free",
    status: null,
    addons: "",
    stripeLive: false,
  });
  const open = applyFoundingPeriodEntitlements(base, false);
  assert.equal(open.inquiryCap, null);
  assert.equal(open.unlimitedInquiries, true);
  assert.equal(open.analyticsDays, 90);
  assert.equal(open.orgDashboard, true);
  assert.equal(open.featuredCity, false);
  const paid = applyFoundingPeriodEntitlements(base, true);
  assert.equal(paid.inquiryCap, base.inquiryCap);
  assert.equal(paid.featuredCity, false);
});

test("plans page renders the founding period on the server and keeps checkout code", () => {
  const page = src("src/routes/plans.tsx");
  assert.match(page, /getPlansGate/);
  assert.match(page, /FoundingPlans/);
  assert.match(page, /OptionalUpgrades/);
  assert.doesNotMatch(page, /min-h-64 max-w-6xl py-12" data-ke="plans-page"/);
  const gate = src("src/lib/server/provider-subscriptions.ts");
  assert.match(gate, /assertPayCheckoutAllowed/);
  assert.match(gate, /startProviderCheckout/);
  assert.match(gate, /subscriptionsEnabled/);
  const migration = src("migrations/0078_founding_member.sql");
  assert.match(migration, /founding_member/);
  assert.match(migration, /d_d85jtifbkh2t/);
  assert.match(src("src/lib/server/approve-centre.ts"), /founding_member/);
  assert.match(src("src/components/nav-drawer.tsx"), /localePath\("\/plans"/);
  assert.match(src("src/lib/site-footer-nav.ts"), /"\/plans"/);
});
