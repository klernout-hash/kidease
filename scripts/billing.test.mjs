import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { stripeChargesLive, INTERNAL_LEDGER_LABEL } from "../src/lib/stripe-live.ts";
import { platformFeeBps, splitFee } from "../src/lib/stripe-methods.ts";
import {
  billIsOpen,
  centsToDollars,
  dollarsToCents,
  parentCanSeeBill,
  parseBillStatus,
  receiveCents,
} from "../src/lib/bill.ts";
import { extractStripeBillRef } from "../src/lib/stripe-bill-event.ts";
import { checkoutSessionBody, flattenStripeBody } from "../src/lib/server/stripe-checkout.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("sk_test stays on the internal ledger", () => {
  assert.equal(stripeChargesLive(""), false);
  assert.equal(stripeChargesLive("sk_test_abc"), false);
  assert.equal(stripeChargesLive("sk_live_abc"), true);
  assert.equal(INTERNAL_LEDGER_LABEL, "Internal ledger (not charged)");
});

test("platform fee defaults to 3% and splits cents honestly", () => {
  const prev = process.env.KIDEASE_PLATFORM_FEE_BPS;
  delete process.env.KIDEASE_PLATFORM_FEE_BPS;
  assert.equal(platformFeeBps(), 300);
  const dollars = splitFee(1200);
  assert.equal(dollars.platformFee, 36);
  assert.equal(dollars.net, 1164);
  const cents = splitFee(120000);
  assert.equal(cents.platformFee, 3600);
  assert.equal(cents.net, 116400);
  assert.equal(dollarsToCents(1200), 120000);
  assert.equal(centsToDollars(3600), 36);
  assert.equal(receiveCents(120000, 3600), 116400);
  if (prev == null) delete process.env.KIDEASE_PLATFORM_FEE_BPS;
  else process.env.KIDEASE_PLATFORM_FEE_BPS = prev;
});

test("draft bills stay invisible to parents until Send", () => {
  assert.equal(parentCanSeeBill("draft"), false);
  assert.equal(parentCanSeeBill("sent"), true);
  assert.equal(parentCanSeeBill("paid"), true);
  assert.equal(billIsOpen("sent"), true);
  assert.equal(billIsOpen("draft"), false);
  assert.equal(parseBillStatus("nope"), "draft");
});

test("checkout metadata carries bill_id and Connect fee only when destinated", () => {
  const base = checkoutSessionBody({
    billId: "bl_1",
    number: "KE-202609-ABCD",
    amountCents: 120000,
    period: "2026-09",
    daycareName: "Elm Daycare",
    successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
    cancelUrl: "https://kidease.ca/pay/bill/bl_1",
    customerEmail: "parent@example.com",
  });
  const flat = Object.fromEntries(flattenStripeBody(base));
  assert.equal(flat["metadata[bill_id]"], "bl_1");
  assert.equal(flat["payment_intent_data[metadata][bill_id]"], "bl_1");
  assert.equal(flat["line_items[0][price_data][unit_amount]"], "120000");
  assert.equal(flat["line_items[0][price_data][currency]"], "cad");
  assert.equal(flat["payment_intent_data[application_fee_amount]"], undefined);

  const connected = checkoutSessionBody({
    billId: "bl_1",
    number: "KE-202609-ABCD",
    amountCents: 120000,
    period: "2026-09",
    daycareName: "Elm Daycare",
    successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
    cancelUrl: "https://kidease.ca/pay/bill/bl_1",
    destinationAccount: "acct_123",
    applicationFeeCents: 3600,
  });
  const cflat = Object.fromEntries(flattenStripeBody(connected));
  assert.equal(cflat["payment_intent_data[application_fee_amount]"], "3600");
  assert.equal(cflat["payment_intent_data[transfer_data][destination]"], "acct_123");
});

test("webhook objects resolve the shared bill id", () => {
  const session = extractStripeBillRef(
    {
      id: "cs_1",
      object: "checkout.session",
      metadata: { bill_id: "bl_9" },
      payment_intent: "pi_1",
      payment_status: "paid",
    },
    "checkout.session.completed",
  );
  assert.equal(session.billId, "bl_9");
  assert.equal(session.sessionId, "cs_1");
  assert.equal(session.paymentIntentId, "pi_1");
  assert.equal(session.paid, true);

  const pi = extractStripeBillRef(
    {
      id: "pi_2",
      object: "payment_intent",
      metadata: { invoice_id: "bl_8" },
      latest_charge: { id: "ch_1", receipt_url: "https://pay.stripe.com/r/1" },
    },
    "payment_intent.succeeded",
  );
  assert.equal(pi.billId, "bl_8");
  assert.equal(pi.chargeId, "ch_1");
  assert.equal(pi.receiptUrl, "https://pay.stripe.com/r/1");
});

test("money path uses Bill / Pay / Paid and extends invoices", () => {
  const migration = src("migrations/0024_bills.sql");
  assert.match(migration, /alter table invoices/);
  assert.match(migration, /amount_cents/);
  assert.match(migration, /stripe_checkout_session_id/);
  assert.doesNotMatch(migration, /create table.*\bbills\b/);

  const webhook = src("src/routes/api/stripe.webhook.ts");
  assert.match(webhook, /applyStripeBillEvent/);
  assert.match(webhook, /payment_intent\.succeeded/);
  assert.match(webhook, /checkout\.session\.completed/);

  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /listParentBills/);
  assert.match(parent, /desks\?\.stripeLive/);
  assert.match(parent, /pay\/bill\/\$billId/);

  const pay = src("src/routes/pay.bill.$billId.tsx");
  assert.match(pay, /billInternalPay/);
  assert.match(pay, /createBillCheckout/);
  assert.match(pay, /stripeLive && bill/);

  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /ProviderMoneyPanel/);
  assert.match(provider, /desk === "money"/);

  const money = src("src/components/provider-money.tsx");
  assert.match(money, /youReceive/);
  assert.match(money, /internal ledger/);
  assert.doesNotMatch(money, /Stripe Connect/);

  const checkout = src("src/lib/server/billing.ts");
  assert.match(checkout, /stripeChargesLive\(\)/);
  assert.match(checkout, /status <> 'draft'/);

  const nav = src("src/lib/desk-nav.ts");
  assert.match(nav, /label: "Money"/);
  assert.match(nav, /label: "Pay"/);
});
