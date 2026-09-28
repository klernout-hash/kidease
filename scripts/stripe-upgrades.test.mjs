import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STRIPE_CATALOG, addonCheckoutMode } from "../src/lib/server/stripe-catalog.ts";
import { checkCatalogPrice, checkoutModeForKind } from "../src/lib/stripe-price-mode.ts";
import {
  planCatalogWrite,
  resolveCatalogLane,
  upgradeConfirmed,
  upgradeSuccessHeadline,
  upgradeSuccessTitle,
} from "../src/lib/stripe-subscription-route.ts";
import { upgradeUnlockedBenefits, DAYCARE_UPGRADE_PLANS, PARENT_UPGRADE_PLANS } from "../src/lib/upgrade-plans.ts";
import {
  UPGRADE_CONFIRMING,
  UPGRADE_CONFIRM_SLOW,
  UPGRADE_CONFIRM_WAIT_MS,
  stripUpgradeReturnQuery,
  upgradeCelebrationKey,
  upgradeReturnFromSearch,
} from "../src/lib/upgrade-return.ts";
import { mapCheckoutError, publicPayMessage, StripeApiError } from "../src/lib/stripe-public-error.ts";
import {
  canBuyDaycareUpgrade,
  canBuyParentUpgrade,
  catalogMetadataAllows,
  profileMayReceiveUpgrade,
  visibleUpgradeSide,
} from "../src/lib/upgrade-role.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const featured = STRIPE_CATALOG.find((item) => item.key === "featured_city");
const boost = STRIPE_CATALOG.find((item) => item.key === "claim_boost");
const job = STRIPE_CATALOG.find((item) => item.key === "job_post");
const pro = STRIPE_CATALOG.find((item) => item.key === "pro_monthly");

test("checkout mode follows the catalog and refuses a one-time Featured city price", () => {
  assert.equal(featured.kind, "recurring");
  assert.equal(featured.interval, "month");
  assert.equal(boost.kind, "one_time");
  assert.equal(job.kind, "one_time");
  assert.equal(checkoutModeForKind("recurring"), "subscription");
  assert.equal(checkoutModeForKind("one_time"), "payment");
  assert.equal(addonCheckoutMode("featured_city"), "subscription");
  assert.equal(addonCheckoutMode("claim_boost"), "payment");
  assert.equal(addonCheckoutMode("job_post"), "payment");
  assert.match(src("src/lib/server/provider-subscriptions.ts"), /mode: checked\.mode/);
  assert.doesNotMatch(src("src/lib/server/provider-subscriptions.ts"), /price_1[A-Za-z0-9]+/);

  const mismatch = checkCatalogPrice(featured, {
    id: "price_once",
    active: true,
    type: "one_time",
    currency: "cad",
    unit_amount: 2900,
    recurring: null,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.mode, null);
  assert.match(mismatch.friendly, /Nothing was charged/);
  assert.doesNotMatch(mismatch.friendly, /subscription mode|must provide/);
  assert.match(mismatch.note, /Expected recurring/);
  assert.match(mismatch.note, /one-time/);

  const monthly = checkCatalogPrice(featured, {
    id: "price_month",
    active: true,
    type: "recurring",
    currency: "cad",
    unit_amount: 2900,
    recurring: { interval: "month" },
  });
  assert.equal(monthly.ok, true);
  assert.equal(monthly.mode, "subscription");

  const once = checkCatalogPrice(boost, {
    id: "price_boost",
    active: true,
    type: "one_time",
    currency: "cad",
    unit_amount: 9900,
  });
  assert.equal(once.ok, true);
  assert.equal(once.mode, "payment");

  const usd = checkCatalogPrice(pro, {
    id: "price_usd",
    active: true,
    type: "recurring",
    currency: "usd",
    unit_amount: 4900,
    recurring: { interval: "month" },
  });
  assert.equal(usd.ok, false);
  assert.match(usd.friendly, /Canadian dollars/);
});
