import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { peekStripeLivemode, selectStripeWebhookSecrets } from "../src/lib/connect-payments.ts";
import { brandedInvoicePdf } from "../src/lib/invoice-pdf.ts";
import { invoiceListHtml } from "../src/lib/invoice-list-html.ts";
import { gateStripeWebhook, resetStripeEventClaimsForTests } from "../src/lib/server/stripe-signature.ts";
import {
  invoiceCustomerEmail,
  invoiceNoticeKey,
  invoiceSmsDecision,
  planParentInvoice,
  rememberStripeEventId,
  unlinkedInvoiceReason,
} from "../src/lib/stripe-parent-invoice.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function signStripe(raw, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const parent = {
  userId: "user_parent",
  email: "parent@example.com",
  locale: "en",
  timeZone: "America/Winnipeg",
  smsConsent: false,
  caslSmsGranted: true,
  smsBlocked: false,
};

const daycare = {
  userId: "user_day",
  email: "owner@daycare.example",
  locale: "fr",
  timeZone: "America/Toronto",
  smsConsent: true,
  caslSmsGranted: true,
  smsBlocked: false,
};

function invoiceObject(extra = {}) {
  return {
    id: "in_123",
    object: "invoice",
    number: "KE-1001",
    currency: "cad",
    amount_due: 12500,
    amount_paid: 0,
    total: 12500,
    hosted_invoice_url: "https://pay.stripe.com/invoice/test",
    invoice_pdf: "https://pay.stripe.com/invoice/test/pdf",
    customer_email: "parent@example.com",
    metadata: {
      kidease: "parent_invoice",
      parent_user_id: "user_parent",
      daycare_id: "day_1",
    },
    ...extra,
  };
}

const day = new Date("2026-01-15T18:00:00.000Z");
const quiet = new Date("2026-01-16T04:30:00.000Z");

function plan(type, extra = {}, objectExtra = {}) {
  return planParentInvoice({
    eventId: extra.eventId || `evt_${type}`,
    type,
    object: invoiceObject(objectExtra),
    now: extra.now || day,
    featureSms: extra.featureSms ?? true,
    appOrigin: "https://www.kidease.ca",
    previousStatus: extra.previousStatus ?? null,
    seenEventIds: extra.seenEventIds,
    parent: extra.parent === undefined ? parent : extra.parent,
    daycare: extra.daycare === undefined ? daycare : extra.daycare,
  });
}

test("test-mode events verify with STRIPE_WEBHOOK_SECRET_TEST", () => {
  const live = "whsec_live_secret";
  const testSecret = "whsec_test_secret";
  const env = { STRIPE_WEBHOOK_SECRET: live, STRIPE_WEBHOOK_SECRET_TEST: testSecret };
  const testBody = JSON.stringify({ id: "evt_test", type: "invoice.finalized", livemode: false, data: { object: { id: "in_1" } } });
  const liveBody = JSON.stringify({ id: "evt_live", type: "invoice.paid", livemode: true, data: { object: { id: "in_2" } } });
  assert.equal(peekStripeLivemode(testBody), false);
  assert.equal(peekStripeLivemode(liveBody), true);
  assert.deepEqual(selectStripeWebhookSecrets(testBody, env), [testSecret]);
  assert.deepEqual(selectStripeWebhookSecrets(liveBody, env), [live]);
  assert.deepEqual(selectStripeWebhookSecrets(testBody, { STRIPE_WEBHOOK_SECRET: live }), [live]);

  resetStripeEventClaimsForTests();
  const opened = gateStripeWebhook(testBody, signStripe(testBody, testSecret), selectStripeWebhookSecrets(testBody, env));
  assert.equal(opened.ok, true);
  const wrong = gateStripeWebhook(testBody, signStripe(testBody, live), selectStripeWebhookSecrets(testBody, env));
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.status, 400);
  const liveOk = gateStripeWebhook(liveBody, signStripe(liveBody, live), selectStripeWebhookSecrets(liveBody, env));
  assert.equal(liveOk.ok, true);
  const liveWithTest = gateStripeWebhook(liveBody, signStripe(liveBody, testSecret), selectStripeWebhookSecrets(liveBody, env));
  assert.equal(liveWithTest.ok, false);
});

test("invoice.finalized emails the parent and texts only with CASL consent", () => {
  const ready = plan("invoice.finalized");
  assert.equal(ready.outcome, "apply");
  assert.equal(ready.invoice.status, "open");
  assert.equal(ready.invoice.amountCents, 12500);
  const emails = ready.notices.filter((notice) => notice.channel === "email" && notice.to);
  assert.deepEqual(emails.map((notice) => notice.audience), ["parent"]);
  assert.match(emails[0].text, /Pay: https:\/\/pay\.stripe\.com\/invoice\/test/);
  assert.match(emails[0].text, /PDF: https:\/\/pay\.stripe\.com\/invoice\/test\/pdf/);
  assert.match(emails[0].text, /125[.,]00/);
  const sms = ready.notices.find((notice) => notice.audience === "parent" && notice.channel === "sms");
  assert.equal(sms.smsAction, "send");
  assert.match(sms.smsBody, /Reply STOP/);

  const checkboxOnly = plan("invoice.finalized", {
    parent: { ...parent, smsConsent: true, caslSmsGranted: false },
  });
  assert.equal(
    checkboxOnly.notices.find((notice) => notice.channel === "sms").smsAction,
    "skip",
  );
  assert.equal(
    checkboxOnly.notices.find((notice) => notice.channel === "sms").smsReason,
    "checkbox_without_casl",
  );

  const flagOff = plan("invoice.finalized", { featureSms: false });
  assert.equal(flagOff.notices.find((notice) => notice.channel === "sms").smsReason, "feature_off");
  assert.equal(flagOff.notices.find((notice) => notice.channel === "email").to, "parent@example.com");

  const french = plan("invoice.finalized", { parent: { ...parent, locale: "fr" } });
  const frMail = french.notices.find((notice) => notice.channel === "email");
  assert.match(frMail.subject, /prête/);
  assert.match(frMail.text, /PDF :/);
  assert.match(frMail.text, /\/fr\/invoices\//);
});

test("invoice.paid notifies parent and daycare, invoice.payment_failed notifies the parent", () => {
  const paid = plan("invoice.paid", {}, { amount_paid: 12500, status_transitions: { paid_at: 1768500000 } });
  assert.equal(paid.invoice.status, "paid");
  assert.equal(paid.invoice.paidAt, new Date(1768500000 * 1000).toISOString());
  const paidEmails = paid.notices.filter((notice) => notice.channel === "email");
  assert.deepEqual(
    paidEmails.map((notice) => notice.audience),
    ["parent", "daycare"],
  );
  assert.match(paidEmails[0].text, /Invoice: KE-1001/);
  assert.match(paidEmails[0].text, /https:\/\/www\.kidease\.ca\/invoices\/in_123/);
  assert.match(paidEmails[1].text, /Facture : KE-1001/);
  assert.match(paidEmails[1].text, /\/fr\/invoices\/in_123/);
  assert.equal(paid.notices.filter((notice) => notice.channel === "sms" && notice.smsAction === "send").length, 2);

  const failed = plan("invoice.payment_failed");
  assert.equal(failed.invoice.status, "failed");
  assert.deepEqual(
    failed.notices.filter((notice) => notice.channel === "email").map((notice) => notice.audience),
    ["parent"],
  );
  assert.match(failed.notices.find((notice) => notice.channel === "email").text, /did not go through/);
  assert.equal(plan("invoice.payment_failed", { previousStatus: "paid" }).outcome, "ignore");
});

test("quiet hours hold SMS and a repeated event id does not notify again", () => {
  const held = plan("invoice.finalized", { now: quiet });
  const sms = held.notices.find((notice) => notice.channel === "sms");
  assert.equal(sms.smsAction, "hold");
  assert.ok(sms.sendAfter);
  assert.equal(held.notices.find((notice) => notice.channel === "email").to, "parent@example.com");

  const blocked = invoiceSmsDecision({
    featureSms: true,
    smsConsent: true,
    caslSmsGranted: true,
    smsBlocked: true,
    quiet: false,
  });
  assert.deepEqual(blocked, { action: "skip", reason: "blocked" });

  const seen = new Set();
  assert.equal(rememberStripeEventId(seen, "evt_1"), true);
  assert.equal(rememberStripeEventId(seen, "evt_1"), false);
  const first = plan("invoice.paid", { eventId: "evt_1" });
  const again = plan("invoice.paid", { eventId: "evt_1", seenEventIds: seen });
  assert.equal(first.outcome, "apply");
  assert.equal(again.outcome, "duplicate");
  assert.equal(again.notices.length, 0);
  assert.equal(invoiceNoticeKey("evt_1", "parent", "email", "Parent@Example.com"), "evt_1:parent:email:parent@example.com");
  assert.equal(plan("invoice.paid", { previousStatus: "paid" }).notices.length, 0);
});

test("customer.email is used when customer_email is missing, and the address is lowercased before lookup", () => {
  assert.equal(
    invoiceCustomerEmail({
      customer_email: "  Parent@Example.com ",
      customer: { email: "other@example.com" },
    }),
    "parent@example.com",
  );
  assert.equal(
    invoiceCustomerEmail({
      customer: { id: "cus_test", email: "Parent@Example.com" },
      metadata: { kidease: "parent_invoice" },
    }),
    "parent@example.com",
  );
  assert.equal(invoiceCustomerEmail({ customer_details: { email: "A@B.com" } }), "a@b.com");
  assert.equal(unlinkedInvoiceReason({ parentUserId: null, customerEmail: null }), "no_customer_email");
  assert.equal(
    unlinkedInvoiceReason({ parentUserId: null, customerEmail: "parent@example.com" }),
    "email_not_in_database",
  );
  assert.equal(unlinkedInvoiceReason({ parentUserId: "user_parent", customerEmail: "parent@example.com" }), null);
  assert.equal(
    unlinkedInvoiceReason({ parentUserId: null, customerEmail: "parent@example.com", database: "none" }),
    "database_unavailable",
  );

  const fromCustomer = planParentInvoice({
    eventId: "evt_customer_object_email",
    type: "invoice.paid",
    object: {
      id: "in_test_customer_email",
      currency: "cad",
      amount_paid: 1000,
      customer: { id: "cus_test", email: "Parent@Example.com" },
      metadata: { kidease: "parent_invoice" },
    },
    links: { parentUserId: "user_parent" },
    now: day,
    featureSms: false,
  });
  assert.equal(fromCustomer.outcome, "apply");
  assert.equal(fromCustomer.invoice.customerEmail, "parent@example.com");
  assert.equal(fromCustomer.invoice.parentUserId, "user_parent");
  assert.equal(
    unlinkedInvoiceReason({
      parentUserId: fromCustomer.invoice.parentUserId,
      customerEmail: fromCustomer.invoice.customerEmail,
    }),
    null,
  );

  const server = src("src/lib/server/stripe-parent-invoices.ts");
  assert.match(server, /unlinked invoice/);
  assert.match(server, /invoiceCustomerEmail/);
  assert.match(server, /lower\(btrim\(email\)\)/);
  assert.match(src("src/routes/api/stripe.webhook.ts"), /unlinked/);
});

test("fee tax and subscription invoices stay off the parent invoice list", () => {
  const fee = plan("invoice.paid", {}, { metadata: { kidease: "fee_tax", daycare_id: "day_1" } });
  assert.equal(fee.outcome, "ignore");
  assert.equal(fee.reason, "fee_tax");
  const sub = plan("invoice.paid", {}, { metadata: {}, subscription: "sub_123" });
  assert.equal(sub.outcome, "ignore");
  assert.equal(sub.reason, "subscription");
  const badUrl = plan("invoice.finalized", {}, { hosted_invoice_url: "javascript:alert(1)" });
  assert.equal(badUrl.invoice.hostedInvoiceUrl, null);
});

test("paid PDF is stamped PAID and the list offers download and print", () => {
  const paid = brandedInvoicePdf({
    id: "in_paid",
    number: "KE-9",
    amountCents: 2500,
    currency: "cad",
    status: "paid",
    paidAt: "2026-01-15T00:00:00.000Z",
    daycareName: "Elm Daycare",
  });
  const text = new TextDecoder().decode(paid);
  assert.match(text, /^%PDF/);
  assert.match(text, /PAID/);
  const open = new TextDecoder().decode(
    brandedInvoicePdf({
      id: "in_open",
      number: "KE-8",
      amountCents: 2500,
      currency: "cad",
      status: "open",
      paidAt: null,
    }),
  );
  assert.doesNotMatch(open, /\/F2 28 Tf 380 720 Td \(PAID\)/);

  const html = invoiceListHtml(
    [
      { id: "in_open", number: "KE-1", amountCents: 1000, currency: "cad", status: "open", paidAt: null, hostedInvoiceUrl: "https://pay.stripe.com/i/1", daycareName: "Elm" },
      { id: "in_paid", number: "KE-2", amountCents: 2000, currency: "cad", status: "paid", paidAt: "2026-01-15", hostedInvoiceUrl: null, daycareName: "Elm" },
      { id: "in_fail", number: "KE-3", amountCents: 3000, currency: "cad", status: "failed", paidAt: null, hostedInvoiceUrl: "https://pay.stripe.com/i/3", daycareName: "Elm" },
    ],
    "en",
  );
  assert.match(html, /data-ke="invoice-status">Open/);
  assert.match(html, /data-ke="invoice-status">Paid/);
  assert.match(html, /data-ke="invoice-status">Failed/);
  assert.match(html, /data-ke="invoice-pdf"/);
  assert.match(html, /data-ke="invoice-print"/);
  assert.match(html, /data-ke="invoice-help"/);
  assert.match(html, /\/api\/invoices\/in_paid\/pdf/);

  const webhook = src("src/routes/api/stripe.webhook.ts");
  assert.match(webhook, /selectStripeWebhookSecrets/);
  assert.match(webhook, /STRIPE_WEBHOOK_SECRET_TEST/);
  assert.match(webhook, /invoice\.finalized/);
  assert.match(webhook, /applyParentStripeInvoice/);
  assert.match(webhook, /duplicate: true/);
  assert.match(src("src/components/stripe-invoice-list.tsx"), /data-ke="invoice-pdf"/);
  assert.match(src("src/components/stripe-invoice-list.tsx"), /data-ke="invoice-print"/);
  assert.match(src("src/components/stripe-invoice-list.tsx"), /data-ke="invoice-help"/);
  assert.match(src("src/routes/api/invoices.$id.pdf.ts"), /invoicePdfHttpResponse/);
  assert.match(src("docs/stripe-preview-webhooks.md"), /STRIPE_WEBHOOK_SECRET_TEST/);
  assert.match(src("docs/stripe-preview-webhooks.md"), /STRIPE_SECRET_KEY/);
  assert.match(src(".env.example"), /^SUBSCRIPTIONS_ENABLED=0$/m);
  assert.match(src(".env.example"), /^FEATURE_SMS=0$/m);
  assert.doesNotMatch(src("src/lib/server/stripe-parent-invoices.ts"), /SUBSCRIPTIONS_ENABLED/);
  assert.doesNotMatch(src("src/routes/invoices.tsx"), /SUBSCRIPTIONS_ENABLED/);
  assert.doesNotMatch(src("docs/stripe-preview-webhooks.md"), /Apple IAP|Google Play Billing|StoreKit/);
});
