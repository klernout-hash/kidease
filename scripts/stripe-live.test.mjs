import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  STRIPE_CATALOG,
  STRIPE_PRICE_ENV,
  amountToCents,
  catalogStatus,
  envPriceId,
  maskStripeSecret,
  plusPriceKey,
  providerPriceKey,
  requiredCatalogMissing,
} from "../src/lib/server/stripe-catalog.ts";
import { catalogCheckoutBody, flattenStripeBody, STRIPE_STATEMENT_SUFFIX } from "../src/lib/server/stripe-checkout.ts";
import { PLUS_MONTHLY_CAD, PLUS_YEARLY_CAD, plusPriceCad } from "../src/lib/parent-plus.ts";
import { PROVIDER_CHECKOUT_LIVE } from "../src/lib/provider-plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("CAD catalog matches the one-pager and never embeds secret keys", () => {
  const byKey = Object.fromEntries(STRIPE_CATALOG.map((i) => [i.key, i]));
  assert.equal(byKey.pro_monthly.amountCad, 49);
  assert.equal(byKey.pro_yearly.amountCad, 490);
  assert.equal(byKey.network_monthly.amountCad, 39);
  assert.equal(byKey.plus_monthly.amountCad, 7.99);
  assert.equal(byKey.plus_yearly.amountCad, 59);
  assert.equal(byKey.featured_city.amountCad, 29);
  assert.equal(byKey.claim_boost.amountCad, 99);
  assert.equal(byKey.job_post.amountCad, 49);
  assert.equal(amountToCents(7.99), 799);
  assert.equal(plusPriceCad("month"), PLUS_MONTHLY_CAD);
  assert.equal(plusPriceCad("year"), PLUS_YEARLY_CAD);
  assert.equal(providerPriceKey("pro", "year"), "pro_yearly");
  assert.equal(providerPriceKey("network", "year"), null);
  assert.equal(plusPriceKey("month"), "plus_monthly");
  assert.equal(STRIPE_PRICE_ENV.pro_monthly, "STRIPE_PRICE_PRO_MONTHLY");
  assert.equal(PROVIDER_CHECKOUT_LIVE, true);
  const files = [
    "src/lib/server/stripe-catalog.ts",
    "src/lib/server/stripe-bootstrap.ts",
    "src/lib/server/stripe-checkout.ts",
    "scripts/stripe-catalog.mjs",
  ];
  for (const file of files) {
    assert.doesNotMatch(src(file), /sk_live_[A-Za-z0-9]{8,}/);
  }
});

test("price IDs are env-only and missing required keys are listed", () => {
  const env = {};
  assert.equal(envPriceId("pro_monthly", env), null);
  assert.deepEqual(requiredCatalogMissing(env).sort(), [
    "network_monthly",
    "plus_monthly",
    "plus_yearly",
    "pro_monthly",
    "pro_yearly",
  ]);
  const set = { STRIPE_PRICE_PRO_MONTHLY: "price_abc", STRIPE_PRICE_PLUS_MONTHLY: "not-a-price" };
  assert.equal(envPriceId("pro_monthly", set), "price_abc");
  assert.equal(envPriceId("plus_monthly", set), null);
  assert.equal(catalogStatus(set).pro_monthly, true);
  assert.equal(catalogStatus(set).plus_monthly, false);
});

test("secret masking never echoes a live key", () => {
  assert.equal(maskStripeSecret(""), "(unset)");
  assert.equal(maskStripeSecret("sk_live_supersecretvalue"), "sk_live_…(redacted)");
  assert.equal(maskStripeSecret("sk_test_supersecretvalue"), "sk_test_…(redacted)");
  assert.doesNotMatch(maskStripeSecret("sk_live_supersecretvalue"), /supersecretvalue/);
});

test("catalog checkout is CAD subscription or payment with KidEase metadata", () => {
  const sub = catalogCheckoutBody({
    mode: "subscription",
    priceId: "price_pro",
    quantity: 3,
    successUrl: "https://kidease.ca/provider/subscription?checkout=success",
    cancelUrl: "https://kidease.ca/provider/subscription?checkout=cancel",
    customerEmail: "centre@example.com",
    clientReferenceId: "user_1",
    metadata: { kidease: "provider_sub", user_id: "user_1", plan: "network", interval: "month" },
  });
  const flat = Object.fromEntries(flattenStripeBody(sub));
  assert.equal(flat.mode, "subscription");
  assert.equal(flat["line_items[0][price]"], "price_pro");
  assert.equal(flat["line_items[0][quantity]"], "3");
  assert.equal(flat["metadata[kidease]"], "provider_sub");
  assert.equal(flat["subscription_data[metadata][plan]"], "network");
  assert.equal(flat.allow_promotion_codes, "true");

  const pay = catalogCheckoutBody({
    mode: "payment",
    priceId: "price_boost",
    successUrl: "https://kidease.ca/provider/subscription?addon=success",
    cancelUrl: "https://kidease.ca/provider/subscription?addon=cancel",
    metadata: { kidease: "addon", addon: "claim_boost" },
  });
  const pflat = Object.fromEntries(flattenStripeBody(pay));
  assert.equal(pflat.mode, "payment");
  assert.equal(pflat["payment_intent_data[statement_descriptor_suffix]"], STRIPE_STATEMENT_SUFFIX);
});

test("webhook composes bill, subscription, and dispute handlers", () => {
  const webhook = src("src/routes/api/stripe.webhook.ts");
  assert.match(webhook, /applyStripeBillEvent/);
  assert.match(webhook, /applyStripeSubscriptionEvent/);
  assert.match(webhook, /applyStripeDisputeEvent/);
  assert.match(webhook, /customer\.subscription\.created/);
  assert.match(webhook, /customer\.subscription\.updated/);
  assert.match(webhook, /customer\.subscription\.deleted/);
  assert.match(webhook, /invoice\.paid/);
  assert.match(webhook, /invoice\.payment_failed/);
  assert.match(webhook, /charge\.dispute\.created/);
  assert.match(webhook, /Unauthorized/);
  assert.match(src("migrations/0025_stripe_live.sql"), /stripe_customer_id/);
  assert.match(src("migrations/0025_stripe_live.sql"), /plus_subscription_id/);
  assert.match(src("migrations/0025_stripe_live.sql"), /stripe_dispute_id/);
});

test("Plus and portal live on parent Pay; catalog is admin-only", () => {
  assert.match(src("src/components/parent-desk.tsx"), /ParentPlusPanel/);
  assert.match(src("src/components/parent-plus.tsx"), /startParentPlusCheckout/);
  assert.match(src("src/components/parent-plus.tsx"), /startParentPlusPortal/);
  assert.match(src("src/lib/server/parent-plus.ts"), /mode: "subscription"/);
  assert.match(src("src/lib/server/parent-plus.ts"), /stripeChargesLive\(\)/);
  assert.match(src("src/routes/api/admin.stripe-catalog.ts"), /requireAdmin/);
  assert.match(src("src/routeTree.gen.ts"), /api\/admin\/stripe-catalog/);
  assert.match(src(".env.example"), /STRIPE_PRICE_PRO_MONTHLY/);
  assert.match(src(".env.example"), /STRIPE_PRICE_PLUS_YEARLY/);
  assert.doesNotMatch(src(".env.example"), /sk_live_[A-Za-z0-9]{8,}/);
});
