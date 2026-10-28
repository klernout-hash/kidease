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
  connectInvoicePaymentSettings,
  connectedAccountBody,
  CONNECT_FEE_BPS_DEFAULT,
  destinationChargeFields,
  appendMonthlyFeeTax,
  FEE_TAX_DESCRIPTION,
  feeTaxPlan,
  isEarlierPeriod,
  manualFeeTaxCents,
  monthlyFeeTaxInvoiceBody,
  monthlyFeeTaxLine,
  parentInvoiceBody,
  PROVINCE_FEE_TAX,
  provinceFeeTax,
  publicConnectState,
  shapeWalletMethod,
  stripeTaxCalculationBody,
  walletSetupIntentBody,
  webhookSecrets,
  withoutHostedInvoice,
} from "../src/lib/connect-payments.ts";
import { isStripePublishableKey } from "../src/lib/stripe-browser.ts";

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

test("a month collects tax from every paid bill, once each", () => {
  const first = appendMonthlyFeeTax({
    recordedBillIds: [],
    billId: "bl_1",
    feeCents: 200,
    taxCents: 10,
    priorFeeCents: 0,
    priorTaxCents: 0,
  });
  assert.equal(first.record, true);
  assert.equal(first.feeCents, 200);
  assert.equal(first.taxCents, 10);
  const second = appendMonthlyFeeTax({
    recordedBillIds: ["bl_1"],
    billId: "bl_2",
    feeCents: 400,
    taxCents: 20,
    priorFeeCents: first.feeCents,
    priorTaxCents: first.taxCents,
  });
  assert.equal(second.feeCents, 600);
  assert.equal(second.taxCents, 30);
  const again = appendMonthlyFeeTax({
    recordedBillIds: ["bl_1", "bl_2"],
    billId: "bl_1",
    feeCents: 200,
    taxCents: 10,
    priorFeeCents: second.feeCents,
    priorTaxCents: second.taxCents,
  });
  assert.equal(again.record, false);
  assert.equal(again.taxCents, 30);
  assert.equal(isEarlierPeriod("2026-09", "2026-10"), true);
  assert.equal(isEarlierPeriod("2026-10", "2026-10"), false);
  assert.equal(isEarlierPeriod("2026-9", "2026-10"), false);
});

test("sample env keeps Connect off and the fee at 2%", () => {
  const env = read(".env.example");
  assert.match(env, /^KIDEASE_PLATFORM_FEE_BPS=200$/m);
  assert.doesNotMatch(env, /KIDEASE_CONNECT_PAYMENTS\s*=\s*1/);
  for (const name of [
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET",
    "KIDEASE_PLATFORM_FEE_BPS",
    "APPLE_MERCHANT_ID",
    "GOOGLE_PAY_MERCHANT_ID",
  ]) {
    assert.match(env, new RegExp(name), name);
  }
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
  assert.equal(manual?.description, FEE_TAX_DESCRIPTION);
  assert.match(manual?.description, /Tax on KidEase fees/);
  assert.match(manual?.description, /Taxe sur les frais KidEase/);
});

test("fee tax follows the daycare province, or Stripe Tax when that flag is on", () => {
  assert.equal(PROVINCE_FEE_TAX.length, 13);
  assert.equal(feeTaxPlan({}).kind, "none");
  assert.deepEqual(
    feeTaxPlan({ STRIPE_AUTOMATIC_TAX: "1", KIDEASE_FEE_TAX_BPS: "500", KIDEASE_FEE_TAX_MODE: "province" }),
    { kind: "stripe_tax" },
  );
  assert.equal(feeTaxPlan({ KIDEASE_FEE_TAX_BPS: "500" }).kind, "manual");
  const table = feeTaxPlan({ KIDEASE_FEE_TAX_MODE: "province", KIDEASE_FEE_TAX_BPS: "500", STRIPE_FEE_TAX_RATE_ID: "txr_flat" });
  assert.equal(table.kind, "province");
  assert.equal(table.fallbackBps, 500);
  assert.equal(table.rateId, "txr_flat");

  const on = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "Ontario" });
  const ab = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "AB" });
  const mb = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "Manitoba" });
  const qc = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "Québec" });
  const ns = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "NS" });
  const nb = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "Nouveau-Brunswick" });
  assert.equal(on?.amount, 1300);
  assert.equal(ab?.amount, 500);
  assert.equal(mb?.amount, 1200);
  assert.equal(qc?.amount, 1498);
  assert.equal(ns?.amount, 1400);
  assert.equal(nb?.amount, 1500);
  assert.notEqual(on?.amount, ab?.amount);
  assert.notEqual(on?.amount, mb?.amount);
  assert.match(on?.description, /Ontario HST 13%/);
  assert.match(on?.description, /TVH de l'Ontario 13 %/);
  assert.match(qc?.description, /QST 14.975%/);
  assert.match(qc?.description, /TVQ du Québec 14,975 %/);
  const noFallback = feeTaxPlan({ KIDEASE_FEE_TAX_MODE: "province" });
  assert.equal(monthlyFeeTaxLine({ plan: noFallback, feeCents: 10_000, province: "California" }), null);
  assert.equal(monthlyFeeTaxLine({ plan: noFallback, feeCents: 10_000, province: "" }), null);
  const fallback = monthlyFeeTaxLine({ plan: table, feeCents: 10_000, province: "" });
  assert.equal(fallback?.amount, 500);
  assert.equal(fallback?.description, FEE_TAX_DESCRIPTION);

  const onTax = stripeTaxCalculationBody(10_000, { province: "ON", postalCode: "m5v2t6" });
  const qcTax = stripeTaxCalculationBody(10_000, { province: "Quebec", postalCode: "not-a-postal" });
  const blank = stripeTaxCalculationBody(10_000, { province: "" });
  assert.equal(onTax.customer_details.address.country, "CA");
  assert.equal(onTax.customer_details.address.state, "ON");
  assert.equal(onTax.customer_details.address.postal_code, "M5V 2T6");
  assert.equal(qcTax.customer_details.address.state, "QC");
  assert.equal(qcTax.customer_details.address.postal_code, undefined);
  assert.equal(blank.customer_details.address.state, undefined);
  assert.equal(onTax.line_items[0].amount, 10_000);
  assert.equal(onTax.line_items[0].tax_behavior, "exclusive");
  assert.notEqual(onTax.customer_details.address.state, qcTax.customer_details.address.state);
  const invoice = monthlyFeeTaxInvoiceBody({
    customerId: "cus_day",
    daycareId: "d1",
    period: "2026-10",
    description: on?.description,
    province: "Ontario",
  });
  assert.equal(invoice.metadata.province, "ON");
  assert.match(invoice.description, /Ontario HST/);
  assert.equal(provinceFeeTax("YT")?.perMillion, 50_000);
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

test("live Connect keys need payments on and KIDEASE_CONNECT_LIVE=1", () => {
  const liveKeys = {
    STRIPE_SECRET_KEY: "sk_live_example",
    STRIPE_PUBLISHABLE_KEY: "pk_live_example",
  };
  assert.deepEqual(connectChargeGate({ ...liveKeys }), { ok: false, reason: "off" });
  assert.deepEqual(connectChargeGate({ KIDEASE_CONNECT_PAYMENTS: "on", ...liveKeys }), { ok: false, reason: "live" });
  assert.deepEqual(connectChargeGate({ KIDEASE_CONNECT_LIVE: "1", ...liveKeys }), { ok: false, reason: "off" });
  assert.deepEqual(
    connectChargeGate({ KIDEASE_CONNECT_PAYMENTS: "on", KIDEASE_CONNECT_LIVE: "0", ...liveKeys }),
    { ok: false, reason: "live" },
  );
  assert.deepEqual(
    connectChargeGate({ KIDEASE_CONNECT_PAYMENTS: "on", KIDEASE_CONNECT_LIVE: "on", ...liveKeys }),
    { ok: false, reason: "live" },
  );
  assert.deepEqual(
    connectChargeGate({ KIDEASE_CONNECT_PAYMENTS: "on", KIDEASE_CONNECT_LIVE: "1", ...liveKeys }),
    { ok: true },
  );
  assert.equal(
    connectChargeGate({
      KIDEASE_CONNECT_PAYMENTS: "on",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    }).ok,
    true,
  );
  assert.deepEqual(
    connectChargeGate({
      KIDEASE_CONNECT_PAYMENTS: "on",
      KIDEASE_CONNECT_LIVE: "1",
      STRIPE_SECRET_KEY: "sk_live_example",
      STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    }),
    { ok: false, reason: "live" },
  );
  assert.deepEqual(
    connectChargeGate({
      KIDEASE_CONNECT_PAYMENTS: "on",
      KIDEASE_CONNECT_LIVE: "1",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    }),
    { ok: false, reason: "live" },
  );
  const blocked = publicConnectState({ KIDEASE_CONNECT_PAYMENTS: "on", ...liveKeys });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.blockedLive, true);
  assert.equal(blocked.publishableKey, null);
  const open = publicConnectState({
    KIDEASE_CONNECT_PAYMENTS: "on",
    KIDEASE_CONNECT_LIVE: "1",
    ...liveKeys,
    APPLE_MERCHANT_ID: "merchant.example",
    GOOGLE_PAY_MERCHANT_ID: "google-example",
  });
  assert.equal(open.ready, true);
  assert.equal(open.blockedLive, false);
  assert.equal(open.publishableKey, "pk_live_example");
  assert.equal(isStripePublishableKey("pk_live_example"), true);
  assert.equal(isStripePublishableKey("pk_test_example"), true);
  assert.equal(isStripePublishableKey("sk_live_example"), false);
});

test("wallet save and invoices do not use a hosted page", () => {
  const setup = walletSetupIntentBody();
  assert.equal(setup.usage, "off_session");
  assert.deepEqual(setup.payment_method_types, ["card", "acss_debit"]);
  assert.equal(setup.payment_method_options.acss_debit.currency, "cad");
  assert.equal(setup.payment_method_options.acss_debit.mandate_options.transaction_type, "personal");
  const settings = connectInvoicePaymentSettings();
  assert.deepEqual(settings.payment_method_types, ["card", "acss_debit"]);
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
  assert.deepEqual(automatic.payment_settings.payment_method_types, ["card", "acss_debit"]);
  const stripped = withoutHostedInvoice({ id: "in_1", hosted_invoice_url: "https://invoice.stripe.com/i/secret", invoice_pdf: "https://files.stripe.com/secret" });
  assert.equal("hosted_invoice_url" in stripped, false);
  assert.equal("invoice_pdf" in stripped, false);
  const account = connectedAccountBody();
  assert.equal(account.country, "CA");
  assert.equal(account.controller.fees.payer, "account");
  assert.equal(account.capabilities.acss_debit_payments.requested, true);
  assert.equal(account.capabilities.card_payments.requested, true);
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
