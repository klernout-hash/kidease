import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { flattenStripeBody } from "../src/lib/server/stripe-checkout.ts";
import {
  applicationFeeCents,
  accountSessionBody,
  classifyConnectEvent,
  connectChargeGate,
  connectFeeBps,
  connectedAccountBody,
  CONNECT_FEE_BPS_DEFAULT,
  destinationChargeFields,
  feeTaxPlan,
  manualFeeTaxCents,
  monthlyFeeTaxLine,
  parentInvoiceBody,
  publicConnectState,
  shapeWalletMethod,
  walletSetupIntentBody,
  webhookSecrets,
  withoutHostedInvoice,
} from "../src/lib/connect-payments.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("Connect fee is exactly 2% and tax stays off the application fee", () => {
  assert.equal(CONNECT_FEE_BPS_DEFAULT, 200);
  assert.equal(connectFeeBps(null), 200);
  assert.equal(connectFeeBps(""), 200);
  assert.equal(applicationFeeCents(10_000, 200), 200);
  assert.equal(applicationFeeCents(10_050, 200), 201);
  assert.equal(applicationFeeCents(0, 200), 0);
  const taxed = feeTaxPlan({ KIDEASE_FEE_TAX_BPS: "500" });
  assert.equal(manualFeeTaxCents(200, taxed), 10);
  assert.equal(applicationFeeCents(10_000, 200), 200);
  const charge = destinationChargeFields({ invoiceCents: 10_000, destination: "acct_day", bps: 200 });
  assert.equal(charge.application_fee_amount, 200);
  assert.equal(charge.on_behalf_of, "acct_day");
  assert.equal(charge.transfer_data.destination, "acct_day");
  assert.equal(charge.amount, 10_000);
  const flat = Object.fromEntries(flattenStripeBody(charge));
  assert.equal(flat.application_fee_amount, "200");
  assert.equal(flat.on_behalf_of, "acct_day");
  assert.equal(flat["transfer_data[destination]"], "acct_day");
  assert.equal(JSON.stringify(charge).includes("tax"), false);
});

test("tax invoice is skipped unless a rate is configured", () => {
  assert.deepEqual(feeTaxPlan({}), { kind: "none" });
  assert.equal(monthlyFeeTaxLine({ plan: { kind: "none" }, feeCents: 200 }), null);
  assert.equal(monthlyFeeTaxLine({ plan: { kind: "stripe_tax" }, feeCents: 200 }), null);
  assert.equal(
    monthlyFeeTaxLine({ plan: { kind: "stripe_tax" }, feeCents: 200, calculatedTaxCents: 10 })?.amount,
    10,
  );
  const manual = monthlyFeeTaxLine({ plan: { kind: "manual", rateId: "txr_ca", taxBps: 500 }, feeCents: 200 });
  assert.equal(manual?.amount, 10);
  assert.equal(manual?.description, "Tax on KidEase fees");
});

test("Connect charges stay off and refuse live keys", () => {
  assert.deepEqual(connectChargeGate({}), { ok: false, reason: "off" });
  assert.deepEqual(
    connectChargeGate({ KIDEASE_CONNECT_PAYMENTS: "1", STRIPE_SECRET_KEY: "sk_live_example" }),
    { ok: false, reason: "live" },
  );
  assert.deepEqual(
    connectChargeGate({
      KIDEASE_CONNECT_PAYMENTS: "1",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    }),
    { ok: false, reason: "live" },
  );
  assert.equal(
    connectChargeGate({
      KIDEASE_CONNECT_PAYMENTS: "1",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    }).ok,
    true,
  );
  const hidden = publicConnectState({
    STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    APPLE_MERCHANT_ID: "merchant.example",
    GOOGLE_PAY_MERCHANT_ID: "google-example",
  });
  assert.equal(hidden.enabled, false);
  assert.equal(hidden.publishableKey, null);
  assert.equal(hidden.appleMerchantId, null);
  const shown = publicConnectState({
    KIDEASE_CONNECT_PAYMENTS: "1",
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    APPLE_MERCHANT_ID: "merchant.example",
    GOOGLE_PAY_MERCHANT_ID: "google-example",
  });
  assert.equal(shown.ready, true);
  assert.equal(shown.publishableKey, "pk_test_example");
  assert.equal(shown.appleMerchantId, "merchant.example");
  assert.equal(shown.googlePayMerchantId, "google-example");
});

test("wallet save and invoices do not use a hosted page", () => {
  const setup = walletSetupIntentBody();
  assert.equal(setup.usage, "off_session");
  assert.deepEqual(setup.payment_method_types, ["card", "acss_debit"]);
  const invoice = parentInvoiceBody({
    mode: "manual",
    customerId: "cus_parent",
    destination: "acct_day",
    invoiceCents: 5000,
    billId: "bl_1",
    bps: 200,
  });
  assert.equal(invoice.collection_method, "send_invoice");
  assert.equal(invoice.application_fee_amount, 100);
  assert.equal(invoice.auto_advance, false);
  const automatic = parentInvoiceBody({
    mode: "automatic",
    customerId: "cus_parent",
    destination: "acct_day",
    invoiceCents: 5000,
    billId: "bl_1",
    defaultPaymentMethod: "pm_card",
    bps: 200,
  });
  assert.equal(automatic.collection_method, "charge_automatically");
  assert.equal(automatic.default_payment_method, "pm_card");
  const stripped = withoutHostedInvoice({ id: "in_1", hosted_invoice_url: "https://invoice.stripe.com/i/secret", invoice_pdf: "https://files.stripe.com/secret" });
  assert.equal("hosted_invoice_url" in stripped, false);
  assert.equal("invoice_pdf" in stripped, false);
  const account = connectedAccountBody();
  assert.equal(account.country, "CA");
  assert.equal(account.controller.fees.payer, "account");
  assert.equal(accountSessionBody("acct_day").components.payouts.enabled, true);
  assert.equal(accountSessionBody("acct_day").components.account_onboarding.enabled, true);
});

test("webhook shapes and saved methods come from Stripe, not invented numbers", () => {
  assert.deepEqual(classifyConnectEvent("account.updated", { id: "acct_1", charges_enabled: true, payouts_enabled: false, details_submitted: true }), {
    kind: "account",
    accountId: "acct_1",
    chargesEnabled: true,
    payoutsEnabled: false,
    detailsSubmitted: true,
  });
  assert.equal(classifyConnectEvent("payout.paid", { id: "po_123" }).kind, "payout");
  assert.equal(classifyConnectEvent("payout.paid", { id: "1234" }).kind, "ignore");
  assert.equal(classifyConnectEvent("invoice.paid", { id: "in_1", metadata: { kidease: "fee_tax", daycare_id: "d1", period: "2026-10" } }).kind, "fee_tax");
  assert.equal(shapeWalletMethod({ id: "pm_1" }, null), null);
  const card = shapeWalletMethod(
    { id: "pm_1", type: "card", card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2028, wallet: null }, metadata: { nickname: "Daycare" } },
    "pm_1",
  );
  assert.equal(card?.last4, "4242");
  assert.equal(card?.nickname, "Daycare");
  assert.equal(card?.isDefault, true);
  assert.deepEqual(webhookSecrets({ STRIPE_WEBHOOK_SECRET: "whsec_a", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_a" }), ["whsec_a"]);
});

test("Connect source does not hardcode live keys or merchant ids", () => {
  const files = [
    "src/lib/connect-payments.ts",
    "src/lib/server/connect-payments.ts",
    "src/lib/stripe-browser.ts",
    "src/components/parent-wallet.tsx",
    "src/components/earnings-payouts.tsx",
  ];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /sk_(live|test)_[A-Za-z0-9]{8,}/, file);
    assert.doesNotMatch(src, /pk_(live|test)_[A-Za-z0-9]{8,}/, file);
    assert.doesNotMatch(src, /merchant\.com\./, file);
  }
  const account = read("src/routes/account.tsx");
  assert.match(account, /connect\.enabled/);
  assert.match(account, /ParentWallet/);
  assert.match(account, /data-ke="account-delete"/);
});
