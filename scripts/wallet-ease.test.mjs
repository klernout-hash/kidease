import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  expiresSoon,
  expiryStatus,
  listAllStripePages,
  planBillRetry,
  planRefund,
  planRemoveMethod,
  setupNextStep,
  shapeMandateView,
} from "../src/lib/wallet-ease.ts";
import { shapeWalletMethod } from "../src/lib/connect-payments.ts";
import { dunningStage, invoiceLetter, planInvoiceMail, updateCardHref } from "../src/lib/automations.ts";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/* PE-1 */

test("PE-1: paging follows starting_after until has_more is false", async () => {
  const all = Array.from({ length: 45 }, (_, i) => ({ id: `pm_fake_${String(i).padStart(3, "0")}` }));
  const calls = [];
  const rows = await listAllStripePages(async (after, limit) => {
    calls.push(after);
    const start = after ? all.findIndex((row) => row.id === after) + 1 : 0;
    const page = all.slice(start, start + Math.min(limit, 20));
    return { data: page, has_more: start + page.length < all.length };
  });
  assert.equal(rows.length, 45);
  assert.deepEqual(calls, [null, "pm_fake_019", "pm_fake_039"]);
});

test("PE-1: paging stops at the 100 cap even when Stripe has more", async () => {
  let n = 0;
  const rows = await listAllStripePages(async () => ({
    data: Array.from({ length: 30 }, () => ({ id: `pm_fake_${n++}` })),
    has_more: true,
  }));
  assert.equal(rows.length, 100);
});

test("PE-1: the server pages /payment_methods instead of one limit:20 call", () => {
  const src = read("src/lib/server/connect-payments.ts");
  assert.match(src, /listAllStripePages/);
  assert.match(src, /starting_after: startingAfter/);
  assert.doesNotMatch(src, /\{ customer: customerId, type, limit: 20 \}/);
});

test("PE-1: removing the default re-picks the newest remaining card", () => {
  const remaining = [
    { id: "pm_old_card", kind: "card", created: 100 },
    { id: "pm_new_card", kind: "card", created: 300 },
    { id: "pm_bank", kind: "acss_debit", created: 400 },
    { id: "pm_removed", kind: "card", created: 500 },
  ];
  assert.deepEqual(planRemoveMethod({ removedId: "pm_removed", defaultId: "pm_removed", remaining }), {
    wasDefault: true,
    newDefaultId: "pm_new_card",
    clearAutopay: false,
  });
  // Only a bank debit left: it becomes the default.
  assert.equal(
    planRemoveMethod({ removedId: "pm_removed", defaultId: "pm_removed", remaining: [{ id: "pm_bank", kind: "acss_debit", created: 1 }] }).newDefaultId,
    "pm_bank",
  );
  // Nothing left: autopay ends and the parent is told.
  assert.deepEqual(planRemoveMethod({ removedId: "pm_removed", defaultId: "pm_removed", remaining: [] }), {
    wasDefault: true,
    newDefaultId: null,
    clearAutopay: true,
  });
  // Not the default: nothing changes.
  assert.deepEqual(planRemoveMethod({ removedId: "pm_old_card", defaultId: "pm_new_card", remaining }), {
    wasDefault: false,
    newDefaultId: null,
    clearAutopay: false,
  });
  const server = read("src/lib/server/connect-payments.ts");
  assert.match(server, /invoice_settings: \{ default_payment_method: plan\.newDefaultId \}/);
  assert.match(server, /if \(plan\.clearAutopay\)/);
});

test("PE-1: expiresSoon is 60 days or less; the card works through its expiry month", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  assert.equal(expiryStatus(11, 2026, now), "soon"); // ends Nov 30
  assert.equal(expiryStatus(1, 2027, now), "ok"); // ends Jan 31 2027: 67 days away
  assert.equal(expiryStatus(12, 2026, now), "soon"); // ends Dec 31: 36 days away
  assert.equal(expiryStatus(10, 2026, now), "expired");
  assert.equal(expiryStatus(12, 2027, now), "ok");
  // Boundary: exactly 60 days left is soon, 61 is ok.
  const end = Date.UTC(2027, 1, 1) - 1; // last ms of January 2027
  assert.equal(expiryStatus(1, 2027, new Date(end - 60 * 86_400_000)), "soon");
  assert.equal(expiryStatus(1, 2027, new Date(end - 61 * 86_400_000)), "ok");
  assert.equal(expiryStatus(1, 2027, new Date(end + 1)), "expired");
  assert.equal(expiresSoon(null, null, now), false);
  assert.equal(expiryStatus(13, 2027, now), null);
  const card = shapeWalletMethod(
    { id: "pm_fake", type: "card", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2026 } },
    null,
    now,
  );
  assert.equal(card.expiresSoon, true);
  assert.equal(card.expired, false);
  const bank = shapeWalletMethod({ id: "pm_bank", type: "acss_debit", acss_debit: { bank_name: "Test Bank", last4: "6789" } }, null, now);
  assert.equal(bank.expiresSoon, false);
});

test("PE-1: the wallet asks before removing and shows Expires soon / Expired (EN and FR)", () => {
  const ui = read("src/components/parent-wallet.tsx");
  assert.match(ui, /AlertDialog\.Root open=\{confirmRemove\}/);
  assert.match(ui, /walletRemoveConfirmNext/);
  assert.match(ui, /walletExpiresSoon/);
  assert.match(ui, /walletExpired/);
  const en = read("src/lib/copy-en.ts");
  const fr = read("src/lib/copy-fr.ts");
  for (const key of ["walletExpiresSoon", "walletExpired", "walletRemoveConfirmTitle", "walletRemoveConfirmNext", "walletAutopayOff", "walletMandateAgreement", "walletVerifyDeposits", "billRefundedOn", "billPartlyRefunded"]) {
    assert.match(en, new RegExp(`\\b${key}: "`), key);
    assert.match(fr, new RegExp(`\\b${key}: "`), key);
  }
  assert.doesNotMatch(en + fr, /\bACH\b/);
});

/* PE-4 */

test("PE-4: mandate shaping keeps status, accepted date and the Stripe agreement link", () => {
  const view = shapeMandateView({
    id: "mandate_fake_1",
    status: "active",
    customer_acceptance: { accepted_at: 1764000000 },
    payment_method_details: {
      acss_debit: { url: "https://pay.stripe.com/mandates/fake", payment_schedule: "sporadic", transaction_type: "personal" },
    },
  });
  assert.equal(view.status, "active");
  assert.equal(view.acceptedAt, new Date(1764000000 * 1000).toISOString());
  assert.equal(view.url, "https://pay.stripe.com/mandates/fake");
  assert.equal(view.schedule, "sporadic");
  assert.equal(view.transactionType, "personal");
  assert.equal(shapeMandateView({ id: "mandate_x", payment_method_details: { acss_debit: { url: "javascript:alert(1)" } } }).url, null);
  assert.equal(shapeMandateView({ id: "nope" }), null);
});

test("PE-4: micro-deposits show Verify deposits; instant verification is done", () => {
  const step = setupNextStep({
    status: "requires_action",
    payment_method: "pm_fake_bank",
    next_action: {
      type: "verify_with_microdeposits",
      verify_with_microdeposits: { hosted_verification_url: "https://payments.stripe.com/microdeposit/fake", arrival_date: 1764100000 },
    },
  });
  assert.equal(step.kind, "verify_microdeposits");
  assert.equal(step.url, "https://payments.stripe.com/microdeposit/fake");
  assert.equal(step.paymentMethodId, "pm_fake_bank");
  assert.deepEqual(setupNextStep({ status: "succeeded", payment_method: { id: "pm_fake_card" } }), { kind: "done", paymentMethodId: "pm_fake_card" });
  assert.equal(setupNextStep({ status: "processing" }).kind, "pending");
});

/* PE-5 */

test("PE-5: dunning reads invoices.failed_at and payment_state", () => {
  const plan = planInvoiceMail({
    invoiceId: "bill_fake",
    status: "sent",
    dueAt: "2026-12-15",
    paidAt: null,
    failedAt: "2026-11-22",
    paymentState: "failed",
    today: "2026-11-25",
    remindersOn: true,
    dunningOn: true,
  });
  assert.deepEqual(plan, { kind: "dunning", stage: "fail_3", dedupeKey: "dun:bill_fake:fail_3" });
  assert.equal(dunningStage("2026-11-25", "2026-11-25"), "fail_0");
  // Dunning off: a failed sent bill still gets normal due-date reminders only.
  const off = planInvoiceMail({ invoiceId: "b", status: "sent", dueAt: "2026-11-25", paidAt: null, failedAt: "2026-11-25", paymentState: "failed", today: "2026-11-25", remindersOn: true, dunningOn: false });
  assert.equal(off.kind, "remind");
  const job = read("src/lib/server/automation-jobs.ts");
  assert.match(job, /i\.failed_at::text as failed_at/);
  assert.match(job, /failedAt: row\.failed_at/);
});

test("PE-5: the dunning email button opens the wallet with the bill", () => {
  for (const locale of ["en", "fr"]) {
    const letter = invoiceLetter({ locale, centreName: "Sunny Centre", number: "KE-1", kind: "dunning", stage: "fail_0", billId: "bill_fake" });
    const href = updateCardHref(locale, "bill_fake");
    assert.equal(letter.branded.cta.href, href);
    assert.ok(href.endsWith(`/account?section=wallet&fix=bill_fake`));
    assert.ok(letter.text.includes(href));
  }
});

test("PE-5: after a card update the bill is retried once through /invoices/{id}/pay with an idempotency key", async () => {
  const base = {
    billId: "bill_fake",
    actorUserId: "user_parent",
    parentUserId: "user_parent",
    status: "sent",
    paymentState: "failed",
    failedAt: "2026-11-25T10:00:00Z",
    stripeInvoiceId: "in_fake_1",
    paymentMethodId: "pm_fake_new",
    mode: "test",
    liveRetryOn: false,
  };
  const plan = planBillRetry(base);
  assert.equal(plan.ok, true);
  assert.equal(plan.path, "/invoices/in_fake_1/pay");
  assert.deepEqual(plan.body, { payment_method: "pm_fake_new", off_session: true });
  // Same failure → same key, so Stripe runs the pay once even if the page retries.
  assert.equal(planBillRetry(base).idempotencyKey, plan.idempotencyKey);
  assert.match(plan.idempotencyKey, /^bill-retry-test-bill_fake-\d+$/);

  // A mocked Stripe that honours idempotency keys: two submits, one pay.
  const seen = new Map();
  const stripePost = async (path, _body, opts) => {
    if (!seen.has(opts.idempotencyKey)) seen.set(opts.idempotencyKey, path);
    return { id: "in_fake_1", status: "paid" };
  };
  await stripePost(plan.path, plan.body, { idempotencyKey: plan.idempotencyKey });
  await stripePost(plan.path, plan.body, { idempotencyKey: planBillRetry(base).idempotencyKey });
  assert.equal(seen.size, 1);

  assert.deepEqual(planBillRetry({ ...base, mode: "live" }), { ok: false, reason: "live_off" });
  assert.deepEqual(planBillRetry({ ...base, paymentState: null }), { ok: false, reason: "not_failed" });
  assert.deepEqual(planBillRetry({ ...base, status: "paid" }), { ok: false, reason: "not_failed" });
  assert.deepEqual(planBillRetry({ ...base, actorUserId: "someone_else" }), { ok: false, reason: "not_owner" });
  assert.deepEqual(planBillRetry({ ...base, stripeInvoiceId: null }), { ok: false, reason: "no_invoice" });
  const server = read("src/lib/server/connect-payments.ts");
  assert.match(server, /idempotencyKey: plan\.idempotencyKey/);
  assert.match(server, /KIDEASE_BILL_RETRY_LIVE/);
  const wallet = read("src/components/parent-wallet.tsx");
  assert.match(wallet, /retried\.current = true/);
});

/* PE-8 */

test("PE-8: partial vs full refund mapping", () => {
  const card = { type: "card", card: { brand: "visa", last4: "4242" } };
  assert.deepEqual(planRefund({ amount: 103, amount_refunded: 50, refunded: false, payment_method_details: card }), {
    refundedCents: 50,
    refundState: "partly_refunded",
    fullRefund: false,
    methodLabel: "Visa ···· 4242",
  });
  assert.deepEqual(planRefund({ amount: 103, amount_refunded: 103, refunded: true, payment_method_details: card }), {
    refundedCents: 103,
    refundState: "refunded",
    fullRefund: true,
    methodLabel: "Visa ···· 4242",
  });
  assert.equal(planRefund({ amount: 100, amount_refunded: 0 }).refundState, null);
  assert.equal(
    planRefund({ amount: 100, amount_refunded: 100, payment_method_details: { type: "acss_debit", acss_debit: { bank_name: "Test Bank", last4: "6789" } } }).methodLabel,
    "Test Bank ···· 6789",
  );
  const billing = read("src/lib/server/billing.ts");
  assert.match(billing, /const refund = planRefund\(/);
  assert.match(billing, /if \(!refund\.fullRefund\)/);
  // BillStatus is not widened.
  assert.match(read("src/lib/bill.ts"), /export type BillStatus = "draft" \| "sent" \| "paid" \| "void" \| "refunded" \| "disputed";/);
});

test("migration 0232 is additive with a down file", () => {
  const up = read("migrations/0232_bill_refund_state.sql");
  const down = read("migrations/down/0232_bill_refund_state.sql");
  assert.match(up, /refunded_cents integer null/);
  assert.match(up, /refund_state text null check \(refund_state in \('partly_refunded','refunded'\)\)/);
  assert.doesNotMatch(up, /\bdrop\b|alter column|rename/i);
  assert.match(down, /drop column if exists refund_state/);
});
