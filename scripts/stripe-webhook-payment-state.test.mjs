import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MANDATE_EVENT_TYPES,
  NO_OP_EVENT_TYPES,
  PAYMENT_STATE_EVENT_TYPES,
  failureReasonText,
  mandateEndedMessage,
  paymentStateMessage,
  planMandateEvent,
  planPaymentStateEvent,
  redactedErrorCode,
  reduceBillPayment,
  runClaimedEvent,
  shapeMandateRow,
} from "../src/lib/payment-state.ts";
import { extractStripeBillRef } from "../src/lib/stripe-bill-event.ts";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// Fixtures shaped like Stripe test events. Ids are fake; no keys.
const pi = (status, extra = {}) => ({
  id: "pi_fake_0001",
  object: "payment_intent",
  status,
  metadata: { kidease: "bill", bill_id: "bill_fake_1" },
  ...extra,
});
const FIXTURES = {
  "payment_intent.processing": pi("processing", { payment_method_types: ["acss_debit"] }),
  "payment_intent.payment_failed": pi("requires_payment_method", {
    last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." },
  }),
  "payment_intent.requires_action": pi("requires_action", { next_action: { type: "use_stripe_sdk" } }),
  "invoice.overdue": {
    id: "in_fake_0001",
    object: "invoice",
    status: "open",
    metadata: { kidease: "bill", bill_id: "bill_fake_1" },
  },
};

const SENT = { status: "sent", paymentState: null };

test("each event resolves the bill id from metadata", () => {
  for (const [type, object] of Object.entries(FIXTURES)) {
    assert.equal(extractStripeBillRef(object, type).billId, "bill_fake_1", type);
    assert.equal(extractStripeBillRef(object, type).paid, false, type);
  }
});

test("each of the 4 events sets the expected payment_state", () => {
  const expected = {
    "payment_intent.processing": { state: "processing", stamp: "processing_at", notify: "processing" },
    "payment_intent.payment_failed": { state: "failed", stamp: "failed_at", notify: "failed" },
    "payment_intent.requires_action": { state: "requires_action", stamp: null, notify: "requires_action" },
    "invoice.overdue": { state: null, stamp: "overdue_at", notify: null },
  };
  for (const type of PAYMENT_STATE_EVENT_TYPES) {
    const plan = planPaymentStateEvent(type, FIXTURES[type], SENT);
    assert.equal(plan.kind, "update", type);
    assert.equal(plan.paymentState, expected[type].state, type);
    assert.equal(plan.stamp, expected[type].stamp, type);
    assert.equal(plan.notify, expected[type].notify, type);
  }
  const failed = planPaymentStateEvent("payment_intent.payment_failed", FIXTURES["payment_intent.payment_failed"], SENT);
  assert.equal(failed.lastErrorCode, "insufficient_funds");
});

test("a paid (or refunded, void, disputed) bill is never downgraded", () => {
  for (const status of ["paid", "refunded", "void", "disputed", "draft"]) {
    for (const type of PAYMENT_STATE_EVENT_TYPES) {
      const plan = planPaymentStateEvent(type, FIXTURES[type], { status, paymentState: null });
      assert.deepEqual(plan, { kind: "skip", reason: "closed" }, `${status} ${type}`);
      const next = reduceBillPayment({ status, paymentState: null }, type, FIXTURES[type]);
      assert.equal(next.status, status);
      assert.equal(next.paymentState, null);
    }
  }
  assert.deepEqual(planPaymentStateEvent("payment_intent.processing", FIXTURES["payment_intent.processing"], null), {
    kind: "skip",
    reason: "no_bill",
  });
});

test("payment_failed then succeeded ends with paid and payment_state null", () => {
  let bill = { status: "sent", paymentState: null };
  bill = reduceBillPayment(bill, "payment_intent.processing", FIXTURES["payment_intent.processing"]);
  assert.equal(bill.paymentState, "processing");
  bill = reduceBillPayment(bill, "payment_intent.payment_failed", FIXTURES["payment_intent.payment_failed"]);
  assert.equal(bill.status, "sent");
  assert.equal(bill.paymentState, "failed");
  assert.equal(bill.lastErrorCode, "insufficient_funds");
  bill = reduceBillPayment(bill, "payment_intent.succeeded", pi("succeeded"));
  assert.deepEqual(bill, { status: "paid", paymentState: null, lastErrorCode: null });
  // A late failure after paid changes nothing.
  bill = reduceBillPayment(bill, "payment_intent.payment_failed", FIXTURES["payment_intent.payment_failed"]);
  assert.equal(bill.status, "paid");
  assert.equal(bill.paymentState, null);
});

test("applyStripeBillEvent clears payment_state when the bill is paid", () => {
  const src = read("src/lib/server/billing.ts");
  assert.match(src, /update invoices set payment_state = null, last_error_code = null/);
  assert.match(src, /export async function applyStripePaymentStateEvent/);
  // The payment-state update only ever touches a sent bill.
  assert.match(src, /where id = \$\{bill\.id\} and status = \$\{"sent"\}/);
});

test("error codes are redacted to a short code, never the message", () => {
  assert.equal(redactedErrorCode({ last_payment_error: { code: "card_declined", message: "secret text" } }), "card_declined");
  assert.equal(redactedErrorCode({ last_payment_error: { code: "Bad code with spaces" } }), null);
  assert.equal(redactedErrorCode(null), null);
  assert.equal(failureReasonText("insufficient_funds", "en"), "not enough funds");
  assert.equal(failureReasonText("insufficient_funds", "fr"), "fonds insuffisants");
  assert.equal(failureReasonText("made_up", "en"), null);
});

test("a replayed event id is a no-op with the database claim", async () => {
  const claimed = new Set();
  let runs = 0;
  const once = (id) =>
    runClaimedEvent({
      claim: async () => {
        if (claimed.has(id)) return false;
        claimed.add(id);
        return true;
      },
      release: async () => {
        claimed.delete(id);
      },
      run: async () => {
        runs += 1;
        return "ok";
      },
    });
  assert.deepEqual(await once("evt_fake_1"), { duplicate: false, result: "ok" });
  assert.deepEqual(await once("evt_fake_1"), { duplicate: true });
  assert.equal(runs, 1);
});

test("a failed apply releases the claim so Stripe's retry runs again", async () => {
  const claimed = new Set();
  let attempt = 0;
  const deps = {
    claim: async () => {
      if (claimed.has("evt_fake_2")) return false;
      claimed.add("evt_fake_2");
      return true;
    },
    release: async () => {
      claimed.delete("evt_fake_2");
    },
    run: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("db down");
      return "ok";
    },
  };
  await assert.rejects(runClaimedEvent(deps), /db down/);
  assert.equal(claimed.has("evt_fake_2"), false);
  assert.deepEqual(await runClaimedEvent(deps), { duplicate: false, result: "ok" });
});

const mandate = (status, pm = "pm_fake_bank") => ({
  id: "mandate_fake_1",
  object: "mandate",
  status,
  livemode: false,
  payment_method: pm,
  customer_acceptance: { accepted_at: 1764000000, type: "online" },
  payment_method_details: {
    type: "acss_debit",
    acss_debit: { url: "https://example.test/mandate", payment_schedule: "sporadic", transaction_type: "personal" },
  },
});

test("mandate.updated inactive on the default autopay method clears autopay", () => {
  const plan = planMandateEvent(mandate("inactive"), { defaultPaymentMethodId: "pm_fake_bank" });
  assert.equal(plan.clearAutopay, true);
  assert.deepEqual(plan.row, {
    mandateId: "mandate_fake_1",
    paymentMethodId: "pm_fake_bank",
    status: "inactive",
    type: "acss_debit",
    livemode: false,
  });
  assert.equal(planMandateEvent(mandate("inactive"), { defaultPaymentMethodId: "pm_fake_card" }).clearAutopay, false);
  assert.equal(planMandateEvent(mandate("active"), { defaultPaymentMethodId: "pm_fake_bank" }).clearAutopay, false);
  assert.equal(planMandateEvent(mandate("inactive"), { defaultPaymentMethodId: null }).clearAutopay, false);
  assert.equal(shapeMandateRow({ id: "nope" }), null);
  assert.equal(shapeMandateRow(mandate("weird")).status, "pending");
  const server = read("src/lib/server/connect-payments.ts");
  assert.match(server, /export async function applyMandateEvent/);
  assert.match(server, /update parent_pay_prefs set mode = \$\{"manual"\}/);
  assert.match(server, /insert into payment_mandates/);
});

test("the route no longer returns ignored for the 6 new types", () => {
  const src = read("src/routes/api/stripe.webhook.ts");
  for (const type of [...PAYMENT_STATE_EVENT_TYPES, ...MANDATE_EVENT_TYPES, ...NO_OP_EVENT_TYPES]) {
    assert.ok(src.includes(`"${type}"`), type);
  }
  assert.match(src, /const PAYMENT_STATE_TYPES = new Set\(/);
  assert.match(src, /const MANDATE_TYPES = new Set\(\["mandate\.updated"\]\)/);
  assert.match(src, /PAYMENT_STATE_TYPES\.has\(type\) \|\|\s*MANDATE_TYPES\.has\(type\) \|\|\s*NO_OP_TYPES\.has\(type\)/);
  // Database claim, released with a 500 on error.
  assert.match(src, /claimStripeWebhookEvent\(eventId, type, livemode\)/);
  assert.match(src, /releaseStripeWebhookEvent\(eventId\)/);
  assert.match(src, /payment state apply failed" \}, \{ status: 500 \}/);
  assert.doesNotMatch(src, /\/v1\/subscriptions/);
});

test("parent copy is Canadian: bank debit (PAD), never ACH, EN and FR", () => {
  const input = { daycareName: "Sunny Centre", amountLabel: "$1", payUrl: "https://kidease.ca/pay/bill/b", walletUrl: "https://kidease.ca/account?section=wallet" };
  const all = [];
  for (const state of ["processing", "failed", "requires_action"]) {
    for (const locale of ["en", "fr"]) all.push(paymentStateMessage(state, { ...input, locale, errorCode: "insufficient_funds" }));
  }
  all.push(mandateEndedMessage("en"), mandateEndedMessage("fr"));
  const text = all.map((row) => `${row.title} ${row.body}`).join("\n");
  assert.doesNotMatch(text, /\bACH\b/);
  assert.match(text, /Bank debits \(PAD\) take 3 to 5 business days/);
  assert.match(text, /débits préautorisés \(DPA\)/);
  assert.match(text, /Your bank debit \(PAD\) agreement ended\. Choose another way to pay\./);
  const en = read("src/lib/copy-en.ts");
  const fr = read("src/lib/copy-fr.ts");
  for (const key of ["billProcessingBody", "billFailedBody", "billActionBody", "billConfirmPayment", "billStateProcessing", "billStateFailed", "billStateAction"]) {
    assert.match(en, new RegExp(`\\b${key}: "`), key);
    assert.match(fr, new RegExp(`\\b${key}: "`), key);
  }
});

test("the pay page confirms 3D Secure with the mode's publishable key", () => {
  const page = read("src/routes/pay.bill.$billId.tsx");
  assert.match(page, /stripe\.handleNextAction\(\{ clientSecret: res\.clientSecret \}\)/);
  assert.match(page, /loadStripeClient\(res\.publishableKey\)/);
  const server = read("src/lib/server/connect-payments.ts");
  assert.match(server, /export const getBillNextAction/);
  assert.match(server, /publishableKey: routed\.publishable, mode: routed\.mode/);
});

test("migration 0231 is additive and has a down file", () => {
  const up = read("migrations/0231_bill_payment_state.sql");
  const down = read("migrations/down/0231_bill_payment_state.sql");
  assert.match(up, /payment_state text null check \(payment_state in \('processing','requires_action','failed'\)\)/);
  for (const column of ["processing_at timestamptz null", "failed_at timestamptz null", "last_error_code text null", "overdue_at timestamptz null"]) {
    assert.ok(up.includes(column), column);
  }
  assert.match(up, /create table if not exists payment_mandates/);
  assert.doesNotMatch(up, /\bdrop\b|\brename\b|alter column/i);
  assert.match(down, /drop table if exists payment_mandates/);
  assert.match(down, /drop column if exists payment_state/);
});
