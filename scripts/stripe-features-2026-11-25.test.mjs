import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  accountSessionBody,
  classifyConnectEvent,
  connectInstantPayoutsEnabled,
  stripeAutomaticTaxEnabled,
} from "../src/lib/connect-payments.ts";
import {
  catalogCheckoutBody,
  portalConfigurationForKey,
} from "../src/lib/server/stripe-checkout.ts";
import {
  CONNECT_NOTICE_TYPES,
  STRIPE_NOTICE_TYPES,
  disputeClosedBillStatus,
  shapeStripeNotice,
} from "../src/lib/stripe-notices.ts";

const root = join(import.meta.dirname, "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("daycare money desk gets the Stripe banner, payments, and documents screens", () => {
  const body = accountSessionBody("acct_day", {});
  const c = body.components;
  assert.equal(c.notification_banner.enabled, true);
  assert.equal(c.account_onboarding.enabled, true);
  assert.equal(c.payouts.enabled, true);
  assert.equal(c.payments.enabled, true);
  assert.equal(c.documents.enabled, true);
  // Refunds and disputes stay in KidEase support.
  assert.equal(c.payments.features.refund_management, false);
  assert.equal(c.payments.features.dispute_management, false);
  assert.equal(c.payments.features.destination_on_behalf_of_charge_management, true);
  const ui = read("src/components/earnings-payouts.tsx");
  for (const name of [
    "notification-banner",
    "account-onboarding",
    "payouts",
    "payments",
    "documents",
  ]) {
    assert.match(ui, new RegExp(`instance\\.create\\("${name}"\\)`));
  }
  const en = read("src/lib/copy-en.ts");
  const fr = read("src/lib/copy-fr.ts");
  for (const key of [
    "connectSetupTitle",
    "connectPayoutsTitle",
    "connectPaymentsTitle",
    "connectDocumentsTitle",
  ]) {
    assert.match(en, new RegExp(`${key}:`));
    assert.match(fr, new RegExp(`${key}:`));
  }
});

test("instant payouts are off unless the flag is exactly on", () => {
  assert.equal(connectInstantPayoutsEnabled({}), false);
  assert.equal(connectInstantPayoutsEnabled({ KIDEASE_CONNECT_INSTANT_PAYOUTS: "0" }), false);
  assert.equal(
    accountSessionBody("acct_day", {}).components.payouts.features.instant_payouts,
    false,
  );
  assert.equal(connectInstantPayoutsEnabled({ KIDEASE_CONNECT_INSTANT_PAYOUTS: "1" }), true);
  assert.equal(
    accountSessionBody("acct_day", { KIDEASE_CONNECT_INSTANT_PAYOUTS: "1" }).components.payouts
      .features.instant_payouts,
    true,
  );
});

test("Stripe Tax on plan checkouts only when STRIPE_AUTOMATIC_TAX is on", () => {
  assert.equal(stripeAutomaticTaxEnabled({}), false);
  assert.equal(stripeAutomaticTaxEnabled({ STRIPE_AUTOMATIC_TAX: "1" }), true);
  const input = {
    mode: "subscription",
    priceId: "price_plus",
    successUrl: "https://kidease.ca/parent",
    cancelUrl: "https://kidease.ca/parent",
    metadata: { kidease: "parent_plus" },
    locale: "en",
  };
  const before = process.env.STRIPE_AUTOMATIC_TAX;
  try {
    delete process.env.STRIPE_AUTOMATIC_TAX;
    assert.equal("automatic_tax" in catalogCheckoutBody(input), false);
    process.env.STRIPE_AUTOMATIC_TAX = "1";
    const on = catalogCheckoutBody(input);
    assert.deepEqual(on.automatic_tax, { enabled: true });
    assert.equal(on.billing_address_collection, "auto");
  } finally {
    if (before === undefined) delete process.env.STRIPE_AUTOMATIC_TAX;
    else process.env.STRIPE_AUTOMATIC_TAX = before;
  }
});

test("live portal configuration ids are never sent with a test key", () => {
  assert.equal(portalConfigurationForKey("bpc_live", "sk_live_x"), "bpc_live");
  assert.equal(portalConfigurationForKey("bpc_live", "rk_live_x"), "bpc_live");
  assert.equal(portalConfigurationForKey("bpc_live", "sk_test_x"), null);
  assert.equal(portalConfigurationForKey("nope", "sk_live_x"), null);
  assert.equal(portalConfigurationForKey(null, "sk_live_x"), null);
});

test("new webhook events are recognised and the endpoint acknowledges them", () => {
  for (const type of [
    "charge.dispute.closed",
    "radar.early_fraud_warning.created",
    "invoice.upcoming",
    "customer.subscription.trial_will_end",
    "setup_intent.setup_failed",
    "payment_method.automatically_updated",
  ]) {
    assert.equal(STRIPE_NOTICE_TYPES.has(type), true, type);
  }
  for (const type of ["payout.failed", "capability.updated", "account.application.deauthorized"]) {
    assert.equal(CONNECT_NOTICE_TYPES.has(type), true, type);
  }
  const route = read("src/routes/api/stripe.webhook.ts");
  assert.match(
    route,
    /STRIPE_NOTICE_TYPES\.has\(type\) \|\|\n\s+CONNECT_NOTICE_TYPES\.has\(type\)/,
  );
  assert.equal(shapeStripeNotice("customer.created", {}), null);
});

test("notices carry ids and short codes only", () => {
  const efw = shapeStripeNotice("radar.early_fraud_warning.created", {
    id: "issfr_1",
    charge: "ch_1",
    fraud_type: "card_never_received",
  });
  assert.equal(efw.chargeId, "ch_1");
  assert.equal(efw.status, "card_never_received");
  assert.match(efw.detail, /issfr_1/);
  const failed = shapeStripeNotice("setup_intent.setup_failed", {
    id: "seti_1",
    customer: "cus_1",
    last_setup_error: {
      code: "card_declined",
      decline_code: "insufficient_funds",
      message: "Your card has insufficient funds.",
    },
  });
  assert.equal(failed.status, "insufficient_funds");
  assert.equal(failed.customerId, "cus_1");
  assert.equal(/insufficient funds\./i.test(failed.detail), false);
  const closed = shapeStripeNotice("charge.dispute.closed", {
    id: "dp_1",
    charge: { id: "ch_2" },
    status: "won",
  });
  assert.equal(closed.chargeId, "ch_2");
  assert.equal(disputeClosedBillStatus("won"), "paid");
  assert.equal(disputeClosedBillStatus("warning_closed"), "paid");
  assert.equal(disputeClosedBillStatus("lost"), "disputed");
  assert.equal(disputeClosedBillStatus("under_review"), null);
});

test("Connect payout failures, capability changes, and disconnects are classified", () => {
  assert.deepEqual(
    classifyConnectEvent("payout.failed", { id: "po_1", failure_code: "account_closed" }),
    {
      kind: "payout_failed",
      payoutId: "po_1",
      failureCode: "account_closed",
    },
  );
  assert.deepEqual(
    classifyConnectEvent("account.application.deauthorized", { id: "ca_1" }, "acct_9"),
    {
      kind: "deauthorized",
      accountId: "acct_9",
    },
  );
  assert.deepEqual(classifyConnectEvent("account.application.deauthorized", { id: "ca_1" }, null), {
    kind: "ignore",
  });
  assert.deepEqual(
    classifyConnectEvent("capability.updated", {
      id: "acss_debit_payments",
      account: "acct_9",
      status: "inactive",
    }),
    {
      kind: "capability",
      accountId: "acct_9",
      capability: "acss_debit_payments",
      status: "inactive",
    },
  );
});
