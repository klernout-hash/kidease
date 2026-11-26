import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { flattenStripeBody, setStripeFetchForTests, stripeRequest } from "../src/lib/server/stripe-checkout.ts";
import { StripeApiError } from "../src/lib/stripe-public-error.ts";
import {
  applicationFeeCents,
  accountSessionBody,
  classifyConnectEvent,
  connectChargeGate,
  connectFeeBps,
  connectInvoicePaymentSettings,
  connectLiveEnabled,
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
  parentChargeQuote,
  parentInvoiceBody,
  parentServiceFeeApplies,
  parentServiceFeeLabel,
  parentServiceFeeLine,
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
import { routeStripeCall } from "../src/lib/stripe-route.ts";
import {
  connectOnboardingMessageKey,
  firstSecretOnce,
  runConnectOnboarding,
  stripeErrorCode,
} from "../src/lib/connect-onboarding.ts";
import { DEFAULT_PLATFORM_FEE_BPS, platformFeeBps } from "../src/lib/stripe-methods.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("Connect fee is exactly 3% and tax stays off the application fee", () => {
  assert.equal(CONNECT_FEE_BPS_DEFAULT, 300);
  assert.equal(CONNECT_FEE_BPS_DEFAULT, DEFAULT_PLATFORM_FEE_BPS);
  assert.equal(connectFeeBps(null), 300);
  assert.equal(connectFeeBps(""), 300);
  assert.equal(connectFeeBps(null), platformFeeBps(null));
  assert.equal(connectFeeBps(""), platformFeeBps(""));
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
  // The parent pays the bill; the fee comes out of the centre's payout.
  assert.equal(charge.amount, 10_000);
  const flat = Object.fromEntries(flattenStripeBody(charge));
  assert.equal(flat.application_fee_amount, "200");
  assert.equal(flat.on_behalf_of, "acct_day");
  assert.equal(flat["transfer_data[destination]"], "acct_day");
  assert.equal(JSON.stringify(charge).includes("tax"), false);
});

test("the parent pays exactly the bill and the centre pays the 3% KidEase fee", () => {
  const quote = parentChargeQuote({ invoiceCents: 10_000, bps: 300, env: {} });
  assert.equal(parentServiceFeeApplies({ env: {} }), true);
  assert.equal(quote.passedToParent, false);
  assert.equal(quote.feePaidBy, "centre");
  assert.equal(quote.feeCents, 0);
  assert.equal(quote.kidEaseFeeCents, 300);
  assert.equal(quote.parentPaysCents, 10_000);
  assert.equal(quote.applicationFeeCents, 300);
  assert.equal(quote.centreReceivesCents, 9_700);
  assert.equal(quote.label, "KidEase fee (3%) / Frais KidEase (3 %)");
  assert.equal(parentServiceFeeLine(quote.feeCents, quote.label), null);
  assert.equal(typeof parentServiceFeeLabel(300), "string");
  // Tax on the KidEase fee is the centre's line, never the parent's.
  const taxed = monthlyFeeTaxLine({
    plan: { kind: "manual", rateId: null, taxBps: 1300 },
    feeCents: quote.kidEaseFeeCents,
  });
  assert.equal(taxed?.amount, 39);
  assert.equal(taxed?.description, FEE_TAX_DESCRIPTION);
  const held = parentChargeQuote({
    invoiceCents: 10_000,
    bps: 300,
    province: "ON",
    daycareId: "centre-1",
    env: { KIDEASE_PARENT_FEE_EXCLUDE_PROVINCES: "ON,QC" },
  });
  assert.equal(held.feeCents, 0);
  assert.equal(held.parentPaysCents, 10_000);
  assert.equal(held.applicationFeeCents, 0);
  assert.equal(held.centreReceivesCents, 10_000);
  assert.equal(held.kidEaseFeeCents, 0);
  const centreOff = parentChargeQuote({
    invoiceCents: 10_000,
    daycareId: "qa-preview-hidden-centre",
    env: { KIDEASE_PARENT_FEE_EXCLUDE_CENTRES: "qa-preview-hidden-centre" },
  });
  assert.equal(centreOff.passedToParent, false);
  assert.equal(parentServiceFeeApplies({ env: { KIDEASE_PARENT_SERVICE_FEE: "0" } }), false);
  const charge = destinationChargeFields({
    invoiceCents: 10_000,
    destination: "acct_day",
    bps: 300,
    env: {},
  });
  assert.equal(charge.amount, 10_000);
  assert.equal(charge.application_fee_amount, 300);
  assert.equal(charge.amount - charge.application_fee_amount, 9_700);
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

test("sample env keeps Connect off and the fee at 3%", () => {
  const env = read(".env.example");
  assert.match(env, /^KIDEASE_PLATFORM_FEE_BPS=300$/m);
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
  assert.deepEqual(account.controller, {
    stripe_dashboard: { type: "none" },
    fees: { payer: "account" },
    losses: { payments: "stripe" },
  });
  assert.equal("requirement_collection" in account.controller, false);
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

/* ---------------- A1: payouts onboarding uses one Stripe mode end to end ---------------- */

const FAKE_KEYS = {
  STRIPE_SECRET_KEY: "sk_live_xxx",
  STRIPE_PUBLISHABLE_KEY: "pk_live_xxx",
  STRIPE_SECRET_KEY_TEST: "sk_test_xxx",
  STRIPE_PUBLISHABLE_KEY_TEST: "pk_test_xxx",
};

const QA_CENTRE = { id: "dc_qa", slug: "sunny-centre", visibility: "public", isTest: 1, isDemo: 0 };
const LIVE_CENTRE = { id: "dc_live", slug: "real-centre", visibility: "public", isTest: 0, isDemo: 0 };
const OWNER = { email: "owner@example.ca", isTest: 0 };

function onboardingDeps(overrides = {}) {
  const calls = { stripe: [], records: [], saved: [] };
  const deps = {
    userId: "user_owner",
    daycareId: "dc_qa",
    ownsCentre: async () => true,
    route: async () =>
      routeStripeCall({ paymentsEnabled: true, liveEnabled: true, payer: OWNER, centre: QA_CENTRE, env: FAKE_KEYS }),
    existingAccountId: async () => null,
    saveAccount: async (id) => {
      calls.saved.push(id);
    },
    stripePost: async (path, body, opts) => {
      calls.stripe.push({ path, opts });
      if (path === "/accounts") return { id: "acct_fake1" };
      return { client_secret: "accs_secret_fake" };
    },
    accountBody: () => ({}),
    sessionBody: (id) => ({ account: id }),
    record: async (row) => {
      calls.records.push(row);
    },
    nonce: () => "n1",
    ...overrides,
  };
  return { deps, calls };
}

test("A1: a QA centre with a non-QA owner gets test mode and the pk_test_ key", async () => {
  const { deps, calls } = onboardingDeps();
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, true);
  assert.equal(res.mode, "test");
  assert.ok(res.publishableKey?.startsWith("pk_test_"));
  assert.equal(res.clientSecret, "accs_secret_fake");
  assert.deepEqual(calls.saved, ["acct_fake1"]);
  // The secret used for the session is the test secret, never live.
  for (const call of calls.stripe) assert.ok(call.opts.secret.startsWith("sk_test_"));
  assert.equal(calls.records.length, 0);
});

test("A1: a live centre with KIDEASE_CONNECT_LIVE=1 is live with the pk_live_ key", async () => {
  const { deps } = onboardingDeps({
    daycareId: "dc_live",
    route: async () =>
      routeStripeCall({ paymentsEnabled: true, liveEnabled: connectLiveEnabled({ KIDEASE_CONNECT_LIVE: "1" }), payer: OWNER, centre: LIVE_CENTRE, env: FAKE_KEYS }),
  });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, true);
  assert.equal(res.mode, "live");
  assert.ok(res.publishableKey?.startsWith("pk_live_"));
});

test("A1: off, live and missing keys stay separate reasons and are logged", async () => {
  const off = onboardingDeps({ route: async () => routeStripeCall({ paymentsEnabled: false, liveEnabled: true, payer: OWNER, centre: LIVE_CENTRE, env: FAKE_KEYS }) });
  assert.equal((await runConnectOnboarding(off.deps)).reason, "off");
  assert.equal(off.calls.records[0].surface, "connect_onboarding");

  const live = onboardingDeps({ route: async () => routeStripeCall({ paymentsEnabled: true, liveEnabled: false, payer: OWNER, centre: LIVE_CENTRE, env: FAKE_KEYS }) });
  const liveRes = await runConnectOnboarding(live.deps);
  assert.equal(liveRes.reason, "live");
  assert.equal(liveRes.mode, "live");
  assert.equal(live.calls.stripe.length, 0);

  const missing = onboardingDeps({
    route: async () => routeStripeCall({ paymentsEnabled: true, liveEnabled: true, payer: OWNER, centre: QA_CENTRE, env: { STRIPE_SECRET_KEY: "sk_live_xxx", STRIPE_PUBLISHABLE_KEY: "pk_live_xxx" } }),
  });
  const missingRes = await runConnectOnboarding(missing.deps);
  assert.equal(missingRes.reason, "missing");
  assert.equal(missingRes.mode, "test");
  assert.equal(missing.calls.records[0].surface, "connect_onboarding");
  assert.equal(missing.calls.stripe.length, 0);
});

test("A1: a non-owner gets not_owner, not missing", async () => {
  const { deps, calls } = onboardingDeps({ ownsCentre: async () => false });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "not_owner");
  assert.equal(calls.stripe.length, 0);
  assert.equal(calls.records[0].surface, "connect_onboarding");
});

test("A1: a Stripe error returns stripe_error with its code and records connect_onboarding", async () => {
  const { deps, calls } = onboardingDeps({
    stripePost: async () => {
      const err = new Error("Your platform needs to accept the platform-controls profile. sk_test_abcdefgh123");
      err.code = "platform_account_required";
      throw err;
    },
  });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "stripe_error");
  assert.equal(res.code, "platform_account_required");
  assert.equal(calls.records.length, 1);
  assert.equal(calls.records[0].surface, "connect_onboarding");
  assert.equal(stripeErrorCode(new Error("no code")), "unknown");
  assert.equal(stripeErrorCode({ code: "Bad Code!" }), "unknown");
  assert.equal(stripeErrorCode({ type: "invalid_request_error" }), "invalid_request_error");
  assert.equal(stripeErrorCode({ param: "controller" }), "controller");
  assert.equal(stripeErrorCode({ param: "controller[losses][payments]" }), "controller_losses_payments");
  assert.equal(stripeErrorCode({ status: 400 }), "http_400");
  assert.equal(stripeErrorCode({ code: "account_invalid", param: "controller", status: 400 }), "account_invalid");
  assert.equal(stripeErrorCode({ code: "Bad Code!", status: 400 }), "http_400");
});

test("A1: StripeApiError keeps a sanitised type and param, and onboarding never shows unknown for them", async () => {
  // The Nov 25 failure: Stripe sent type + message but no code.
  const stripeMessage =
    "When controlling requirement collection, the Connect application must also control losses, fees, and specify a dashboard type of none.";
  const err = new StripeApiError(stripeMessage, 400, undefined, { type: "invalid_request_error", param: "controller" });
  assert.equal(err.code, null);
  assert.equal(err.type, "invalid_request_error");
  assert.equal(err.param, "controller");
  assert.equal(stripeErrorCode(err), "controller");
  const typeOnly = new StripeApiError(stripeMessage, 400, null, { type: "invalid_request_error" });
  assert.equal(stripeErrorCode(typeOnly), "invalid_request_error");
  const statusOnly = new StripeApiError(stripeMessage, 502, null);
  assert.equal(stripeErrorCode(statusOnly), "http_502");
  const dirty = new StripeApiError(stripeMessage, 400, null, { type: "Has spaces and acct_123 text!", param: "x".repeat(80) });
  assert.equal(dirty.type, null);
  assert.equal(dirty.param, null);
  const { deps } = onboardingDeps({
    stripePost: async () => {
      throw new StripeApiError(stripeMessage, 400, undefined, { type: "invalid_request_error" });
    },
  });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.reason, "stripe_error");
  assert.equal(res.code, "invalid_request_error");
  assert.notEqual(res.code, "unknown");
  assert.equal(String(res.code).includes("controlling"), false);
});

test("A1: stripeRequest passes Stripe's error type and param to StripeApiError", async () => {
  setStripeFetchForTests(async () =>
    new Response(
      JSON.stringify({ error: { type: "invalid_request_error", param: "controller[losses][payments]", message: "Nope." } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    ),
  );
  try {
    await assert.rejects(
      () => stripeRequest("/accounts", { country: "CA" }, "POST", { secret: "sk_test_unit" }),
      (err) => {
        assert.ok(err instanceof StripeApiError);
        assert.equal(err.status, 400);
        assert.equal(err.code, null);
        assert.equal(err.type, "invalid_request_error");
        assert.equal(err.param, "controller[losses][payments]");
        assert.equal(stripeErrorCode(err), "controller_losses_payments");
        return true;
      },
    );
  } finally {
    setStripeFetchForTests(null);
  }
});

test("A1: Connect.js gets the first secret once, then a fresh one", async () => {
  let fetched = 0;
  const next = firstSecretOnce("first_secret", async () => `fresh_${++fetched}`);
  assert.equal(await next(), "first_secret");
  assert.equal(await next(), "fresh_1");
  assert.equal(await next(), "fresh_2");
});

test("A1: each reason has an EN and FR message", () => {
  const en = read("src/lib/copy-en.ts");
  const fr = read("src/lib/copy-fr.ts");
  for (const reason of ["off", "live", "missing", "not_owner", "stripe_error"]) {
    const key = connectOnboardingMessageKey(reason);
    assert.match(en, new RegExp(`\\b${key}: "`), key);
    assert.match(fr, new RegExp(`\\b${key}: "`), key);
  }
  assert.match(en, /connectErrStripe: "Stripe couldn't start setup \(code \{code\}\)/);
});

test("A1: earnings-payouts starts Connect.js with the session's key, not connect.publishableKey", () => {
  const src = read("src/components/earnings-payouts.tsx");
  assert.doesNotMatch(src, /loadConnectInstance\(\s*publishableKey/);
  assert.doesNotMatch(src, /connect\?*\.publishableKey/);
  assert.match(src, /loadConnectInstance\(first\.publishableKey, firstSecretOnce\(first\.clientSecret/);
  assert.match(src, /withReauth\(/);
  const server = read("src/lib/server/connect-payments.ts");
  assert.match(server, /runConnectOnboarding\(\{/);
  assert.match(server, /assertPersistentStepUp\(context\.userId, "payout_bank"\)/);
  assert.match(server, /record: recordStripeCheckoutError/);
});
