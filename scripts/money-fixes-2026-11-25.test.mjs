// Nov 25 money fixes: Connect idempotency, centre-paid KidEase fee, French CAD,
// earnings crash, invoice/receipt PDFs, redirects, owner check, reminders, speed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import {
  connectAccountIdempotencyKey,
  runConnectOnboarding,
  stableBodyHash,
} from "../src/lib/connect-onboarding.ts";
import { parentChargeQuote, quoteShownOnPayPage, connectedAccountBody } from "../src/lib/connect-payments.ts";
import { checkoutSessionBody, flattenStripeBody } from "../src/lib/server/stripe-checkout.ts";
import { formatCad, frenchCad } from "../src/lib/cad-format.ts";
import { money } from "../src/lib/utils.ts";
import { earningsSummary, isoOrNull } from "../src/lib/bill.ts";
import { qboJournal, qboJournalBalances } from "../src/lib/qbo-sync.ts";
import { brandedInvoicePdf, invoicePaidStamp, invoicePdfLines } from "../src/lib/invoice-pdf.ts";
import { cadFromCents, federalReceiptLines, taxReceiptPdf } from "../src/lib/tax-receipts.ts";
import { pdfEscape } from "../src/lib/gov/pdf.ts";
import { formatPlanCad } from "../src/lib/upgrade-plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const NB = "\u00a0";

function pdfText(bytes) {
  const raw = Buffer.from(bytes).toString("latin1");
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => {
    const chunk = Buffer.from(m[1], "latin1");
    try {
      return inflateSync(chunk).toString("latin1");
    } catch {
      return m[1];
    }
  });
  return raw + streams.join("\n");
}

// ---------- 1. Connect "Set up payouts" ----------

test("the account idempotency key changes with the body, not with key order", () => {
  const a = connectAccountIdempotencyKey("test", "d_1", { country: "CA", controller: { fees: { payer: "application" } } });
  const b = connectAccountIdempotencyKey("test", "d_1", { controller: { fees: { payer: "application" } }, country: "CA" });
  const c = connectAccountIdempotencyKey("test", "d_1", { country: "CA", controller: { fees: { payer: "account" } } });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^connect-acct-test-d_1-[0-9a-z]+$/);
  assert.equal(stableBodyHash({ x: 1, y: [1, 2] }), stableBodyHash({ y: [1, 2], x: 1 }));
  assert.equal(connectedAccountBody("d_9").metadata.kidease_daycare_id, "d_9");
});

function onboardingDeps(overrides = {}) {
  const calls = { posts: [], saved: [], logs: [] };
  const deps = {
    userId: "u_1",
    daycareId: "d_1",
    ownsCentre: async () => true,
    route: async () => ({ ok: true, mode: "test", secret: "sk_test_fixture", publishable: "pk_test_fixture" }),
    existingAccountId: async () => null,
    saveAccount: async (id) => calls.saved.push(id),
    stripePost: async (path, body, opts) => {
      calls.posts.push({ path, key: opts.idempotencyKey });
      if (path === "/accounts") return { id: "acct_new" };
      return { client_secret: "accs_secret_fixture" };
    },
    accountBody: () => ({ country: "CA", metadata: { kidease_daycare_id: "d_1" } }),
    sessionBody: () => ({}),
    record: async (row) => calls.logs.push(row.detail),
    nonce: () => "n1",
    ...overrides,
  };
  return { deps, calls };
}

test("an idempotency_error retries once with a fresh key and logs the Stripe request id", async () => {
  let first = true;
  const { deps, calls } = onboardingDeps({
    stripePost: async (path, body, opts) => {
      calls.posts.push({ path, key: opts.idempotencyKey });
      if (path === "/accounts" && first) {
        first = false;
        throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), {
          code: "idempotency_error",
          requestId: "req_fixture123",
        });
      }
      if (path === "/accounts") return { id: "acct_retry" };
      return { client_secret: "accs_secret_fixture" };
    },
    findAccountForCentre: async () => null,
  });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, true);
  const accountPosts = calls.posts.filter((p) => p.path === "/accounts");
  assert.equal(accountPosts.length, 2);
  assert.equal(accountPosts[1].key, `${accountPosts[0].key}-rn1`);
  assert.deepEqual(calls.saved, ["acct_retry"]);
  assert.ok(calls.logs.some((line) => line.includes("req_fixture123")));
});

test("an account Stripe already made for the centre is reused, never duplicated", async () => {
  const { deps, calls } = onboardingDeps({ findAccountForCentre: async () => "acct_found" });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, true);
  assert.equal(calls.posts.filter((p) => p.path === "/accounts").length, 0);
  assert.deepEqual(calls.saved, ["acct_found"]);
});

test("other Stripe errors fail cleanly with the request id in the log", async () => {
  const { deps, calls } = onboardingDeps({
    stripePost: async () => {
      throw Object.assign(new Error("When controlling requirement collection, the Connect application must also control losses"), {
        code: "invalid_request_error",
        requestId: "req_other",
      });
    },
  });
  const res = await runConnectOnboarding(deps);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "stripe_error");
  assert.ok(calls.logs.some((line) => line.includes("req_other")));
});

// ---------- 6. KidEase fee paid by the centre ----------

test("parents pay exactly the bill; the 3% KidEase fee comes out of the payout", () => {
  const quote = parentChargeQuote({ invoiceCents: 120_000, bps: 300, env: {} });
  assert.equal(quote.parentPaysCents, 120_000);
  assert.equal(quote.feeCents, 0);
  assert.equal(quote.kidEaseFeeCents, 3_600);
  assert.equal(quote.applicationFeeCents, 3_600);
  assert.equal(quote.centreReceivesCents, 116_400);
  assert.equal(quoteShownOnPayPage(quote, false).applicationFeeCents, 0, "no Connect destination: nothing deducted");
  const body = checkoutSessionBody({
    billId: "bl_1",
    number: "KE-1",
    amountCents: 120_000,
    period: "2026-11",
    daycareName: "Elm",
    successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
    cancelUrl: "https://kidease.ca/pay/bill/bl_1",
    destinationAccount: "acct_1",
    applicationFeeCents: quote.applicationFeeCents,
    serviceFeeLabel: quote.label,
  });
  const flat = Object.fromEntries(flattenStripeBody(body));
  assert.equal(flat["payment_intent_data[application_fee_amount]"], "3600");
  assert.equal(flat["line_items[0][price_data][unit_amount]"], "120000");
  assert.equal(flat["line_items[1][price_data][unit_amount]"], undefined);
});

test("the QuickBooks journal balances with the KidEase fee as a centre expense", () => {
  const lines = qboJournal({ invoiceCents: 10_000, feeCents: 300, province: "ON" });
  assert.equal(qboJournalBalances(lines), true);
  assert.equal(lines.find((l) => l.account === "stripe_clearing").debitCents, 9_700);
  assert.equal(lines.find((l) => l.account === "platform_fee").debitCents, 300);
  assert.equal(lines.find((l) => l.account === "parent_fees").creditCents, 10_000);
  assert.equal(qboJournalBalances(qboJournal({ invoiceCents: 10_000, feeCents: 0, province: "ON" })), true);
});

test("parent copy no longer adds a KidEase fee; centres see it on bills and earnings", () => {
  const en = src("src/lib/copy-en.ts");
  const fr = src("src/lib/copy-fr.ts");
  assert.doesNotMatch(en, /plus a KidEase service fee/i);
  assert.doesNotMatch(fr, /plus des frais de service KidEase/i);
  const money = src("src/components/provider-money.tsx");
  assert.match(money, /data-ke="bill-centre-fee"/);
  assert.match(money, /afterKidEaseFee/);
});

// ---------- 4. French money ----------

test("French money always reads 1,00 $ CA", () => {
  assert.equal(frenchCad(1), `1,00${NB}$${NB}CA`);
  assert.equal(formatCad(1234.5, "fr-CA").replace(/\s/g, " "), "1 234,50 $ CA");
  assert.equal(formatCad(1, "en-CA"), "$1.00");
  assert.equal(money(1, "fr"), `1,00${NB}$${NB}CA`);
  assert.equal(formatPlanCad(1, "fr"), `1,00${NB}$${NB}CA`);
  assert.equal(cadFromCents(100, "fr"), `1,00${NB}$${NB}CA`);
  assert.equal(cadFromCents(100, "en"), "$1.00");
});

// ---------- B02 #1. Earnings crash ----------

test("bill dates from Postgres (Date objects) become strings before reaching the page", () => {
  const paid = new Date("2026-11-25T23:30:00Z");
  assert.equal(isoOrNull(paid), "2026-11-25T23:30:00.000Z");
  assert.equal(isoOrNull(new Date("2026-12-01T00:00:00Z"), true), "2026-12-01");
  assert.equal(isoOrNull(null), null);
  assert.equal(isoOrNull("2026-11-25"), "2026-11-25");
  const summary = earningsSummary(
    [{ status: "paid", amountCents: 100, netCents: 97, paidAt: paid }],
    new Date("2026-11-26T00:00:00Z"),
  );
  assert.ok(summary);
  assert.match(src("src/lib/server/billing.ts"), /paidAt: isoOrNull\(/);
});

// ---------- B02 #2-4. Invoice and receipt PDFs ----------

test("invoice PDFs carry CAD, the GST/HST wording and the centre address", () => {
  const base = {
    id: "in_1",
    number: "KE-1001",
    amountCents: 100,
    currency: "cad",
    status: "paid",
    paidAt: "2026-11-25T23:30:00Z",
    daycareName: "KidEase QA Test Centre",
    daycareAddress: "1 Main St, Winnipeg, MB R3C 0A1",
  };
  const en = invoicePdfLines({ ...base, locale: "en" }).join("\n");
  assert.match(en, /\$1\.00 CAD/);
  assert.match(en, /GST\/HST: no tax charged/);
  assert.match(en, /Address: 1 Main St, Winnipeg, MB R3C 0A1/);
  const fr = invoicePdfLines({ ...base, locale: "fr" }).join("\n");
  assert.match(fr, /1,00\s\$\sCA/);
  assert.match(fr, /TPS\/TVH : aucune taxe facturée/);
  assert.match(fr, /Statut : Payée/);
  assert.match(fr, /Date du paiement : 2026-11-25/);
  assert.equal(invoicePaidStamp("fr"), "PAYÉE");
  assert.equal(invoicePaidStamp("en"), "PAID");
  const pdf = pdfText(brandedInvoicePdf({ ...base, locale: "fr" }));
  assert.match(pdf, /WinAnsiEncoding/);
  // "é" and "É" print as single WinAnsi bytes, not folded to ASCII.
  assert.ok(pdf.includes("Pay\u00e9e") || pdf.includes("Pay\\351e"), "Statut : Payée keeps its accent");
  assert.ok(pdf.includes("PAY\u00c9E") || pdf.includes("PAY\\311E"), "PAYÉE stamp");
  assert.equal(pdfEscape("(é’)"), "\\(\\351\\222\\)");
});

test("the French T778 receipt is in French with French money", () => {
  const group = {
    year: 2026,
    daycareId: "d_1",
    daycareName: "Centre QA",
    province: "MB",
    addressLine: "1 rue Principale, Winnipeg, MB",
    licenseNumber: "L-1",
    childId: "c_1",
    childName: "Enfant QA",
    childBirthdate: "2022-01-01",
    parentUserId: "u_1",
    parentName: "Parent QA",
    amountCents: 100,
    invoiceCount: 1,
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    daysOfCare: null,
    reference: "KE-2026-1",
  };
  const en = federalReceiptLines(group, "en").join("\n");
  const fr = federalReceiptLines(group, "fr").join("\n");
  assert.notEqual(en, fr);
  assert.match(fr, /1,00\s\$\sCA/);
  assert.doesNotMatch(fr, /\$1\.00/);
  assert.ok(taxReceiptPdf(group, "federal", "fr") instanceof Uint8Array);
});

// ---------- B02 #1 and #6. Redirects ----------

test("old earnings and bills paths redirect to the real tabs", () => {
  const { redirects } = JSON.parse(src("vercel.json"));
  const find = (source) => redirects.find((r) => r.source === source);
  assert.equal(find("/provider/earnings")?.destination, "/provider?desk=money");
  assert.equal(find("/fr/provider/earnings")?.destination, "/fr/provider?desk=money");
  assert.equal(find("/parent/bills")?.destination, "/parent?tab=payments");
  assert.equal(find("/fr/parent/bills")?.destination, "/fr/parent?tab=payments");
  const home = src("src/components/parent-home.tsx");
  assert.match(home, /data-ke="parent-home-bills-heading"/);
  assert.match(home, /onOpenPayments/);
  assert.match(src("src/components/parent-desk.tsx"), /onOpenPayments=\{\(\) => selectParentTab\("payments"\)\}/);
});

// ---------- 2. Contract desk owner check ----------

test("owner-only tabs wait for the session instead of telling the owner they are not the owner", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /function OwnerOnlyNotice/);
  assert.match(provider, /Checking your access|Vérification de votre accès/);
  assert.match(provider, /sessionReady/);
  const verify = src("src/lib/auth/verify.server.ts");
  assert.match(verify, /function sharedSessionLookup/);
  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /Promise\.all\(/);
});

// ---------- 3. Send reminder ----------

test("Send reminder is behind FEATURE_INVOICE_REMINDERS and uses the automation mail rules", () => {
  const billing = src("src/lib/server/billing.ts");
  const start = billing.indexOf("export const sendBillReminder");
  assert.ok(start > 0);
  const fn = billing.slice(start, billing.indexOf("export const voidBill"));
  assert.match(fn, /invoiceRemindersEnabled\(\)/);
  assert.match(fn, /assertStaffArea\(sql, context\.userId, row\.daycare_id, "bills", "edit"\)/);
  assert.match(fn, /automationModeFromEnv\("FEATURE_INVOICE_REMINDERS"/);
  assert.match(fn, /AUTOMATION_TEST_EMAILS/);
  assert.match(fn, /dispatchAutomationMail/);
  assert.match(fn, /dedupeKey: `manual:\$\{bill\.id\}:/);
  assert.match(billing, /remindersOn: moneyDesk && invoiceRemindersEnabled\(\)/);
  assert.match(src("src/components/provider-money.tsx"), /data-ke="bill-send-reminder"/);
});

// ---------- 5 / B02 #7. Pay speed ----------

test("Pay now and the paid return do independent work together", () => {
  const pay = src("src/routes/pay.bill.$billId.tsx");
  assert.match(pay, /Promise\.all\(\[\s*saveMyCaslConsents/);
  const billing = src("src/lib/server/billing.ts");
  assert.match(billing, /const \[settled, connect, profile\] = await Promise\.all\(\[/);
  assert.match(billing, /const connectPromise = sql/);
});
