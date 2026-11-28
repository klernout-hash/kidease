import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resetSavePdfGuard, savePdfBytes, savePdfFailedText, savePdfSucceeded } from "../src/lib/save-pdf.ts";
import { careMonthBill, careMonthBillCopy } from "../src/lib/care-month-bill.ts";
import { NATIVE_COMMERCE_SELECTORS } from "../src/lib/native-entitlements.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const pdf = new Uint8Array([37, 80, 68, 70]);

test("P1-5: the website downloads one PDF and reports a real success", async () => {
  resetSavePdfGuard();
  let downloads = 0;
  const result = await savePdfBytes(pdf, "a.pdf", { native: false, download: () => ((downloads += 1), true) });
  assert.equal(result, "downloaded");
  assert.equal(downloads, 1);
  assert.equal(savePdfSucceeded(result), true);
});

test("P1-5: the phone app opens the share sheet with the file, not a dead blob link", async () => {
  resetSavePdfGuard();
  const shared = [];
  let downloads = 0;
  const env = {
    native: true,
    makeFile: (bytes, name) => ({ name, size: bytes.length }),
    canShare: (data) => data.files.length === 1,
    share: async (data) => {
      shared.push(data);
    },
    download: () => ((downloads += 1), true),
  };
  assert.equal(await savePdfBytes(pdf, "receipt.pdf", env), "shared");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].name, "receipt.pdf");
  assert.equal(downloads, 0, "native never falls back to the blob link that does nothing on iOS");
});

test("P1-5: no share sheet or a closed sheet is never reported as saved", async () => {
  resetSavePdfGuard();
  const noShare = await savePdfBytes(pdf, "a.pdf", { native: true, makeFile: () => ({}), download: () => true });
  assert.equal(noShare, "failed");
  assert.equal(savePdfSucceeded(noShare), false);
  const closed = await savePdfBytes(pdf, "a.pdf", {
    native: true,
    makeFile: () => ({}),
    canShare: () => true,
    share: async () => {
      throw Object.assign(new Error("closed"), { name: "AbortError" });
    },
  });
  assert.equal(closed, "cancelled");
  assert.equal(savePdfSucceeded(closed), false);
  assert.match(savePdfFailedText("fr"), /navigateur/);
  assert.match(savePdfFailedText("en"), /browser/);
});

test("P1-5: a second tap while the first save is open does not save a second file", async () => {
  resetSavePdfGuard();
  let release;
  let shares = 0;
  const env = {
    native: true,
    makeFile: () => ({}),
    canShare: () => true,
    share: () =>
      new Promise((resolve) => {
        shares += 1;
        release = resolve;
      }),
  };
  const first = savePdfBytes(pdf, "a.pdf", env);
  assert.equal(await savePdfBytes(pdf, "a.pdf", env), "busy");
  release();
  assert.equal(await first, "shared");
  assert.equal(shares, 1);
});

test("P1-5: invoice and tax receipt buttons use the shared saver and only say saved on success", () => {
  const invoices = src("src/components/stripe-invoice-list.tsx");
  assert.match(invoices, /savePdfBytes\(bytes, invoicePdfFilename/);
  assert.doesNotMatch(invoices, /link\.click\(\)/);
  const tax = src("src/components/tax-receipt-studio.tsx");
  assert.match(tax, /savePdfBytes\(base64ToBytes\(result\.pdfBase64\)/);
  assert.match(tax, /if \(!savePdfSucceeded\(saved\)\) return;\s*setProblem\("saved"\)/);
  assert.doesNotMatch(tax, /function savePdf\(/);
});

test("P1-6: the month summary shows the sent bill from invoices, not a second number", () => {
  const rows = [
    { id: "inv_old", booking_id: "bk_1", period: "2026-11", status: "void", amount_cents: 1000, total: 10, created_at: "2026-11-02" },
    { id: "inv_draft", booking_id: "bk_1", period: "2026-11", status: "draft", amount_cents: 9999, total: 99.99, created_at: "2026-11-29" },
    { id: "inv_sent", booking_id: "bk_1", period: "2026-11", status: "sent", amount_cents: null, total: "412.50", created_at: "2026-11-28" },
    { id: "inv_oct", booking_id: "bk_1", period: "2026-10", status: "paid", amount_cents: 40000, total: 400, created_at: "2026-10-30" },
    { id: "inv_other", booking_id: "bk_2", period: "2026-11", status: "paid", amount_cents: 5000, total: 50, created_at: "2026-11-30" },
  ];
  assert.deepEqual(careMonthBill(rows, "bk_1", "2026-11"), { id: "inv_sent", status: "sent", amountCents: 41250 });
  assert.deepEqual(careMonthBill(rows, "bk_1", "2026-10"), { id: "inv_oct", status: "paid", amountCents: 40000 });
  assert.equal(careMonthBill(rows, "bk_1", "2026-09"), null);
  assert.equal(careMonthBill(rows, "bk_3", "2026-11"), null);
  assert.match(careMonthBillCopy("fr").billed("412,50 $"), /^Facturé : 412,50 \$$/);
  assert.match(careMonthBillCopy("en").estimate, /not a bill/);
});

test("P1-6: getLicensedMonth reads the invoices table read-only, scoped to parent or owner", () => {
  const care = src("src/lib/server/care-ops.ts");
  assert.match(care, /from invoices\s+where booking_id = any\(\$1::text\[\]\) and period = \$2 and status <> 'draft'/);
  assert.match(care, /kid\.parent_user_id === context\.userId \|\| ownedCentres\.has\(kid\.daycare_id\)/);
  assert.match(care, /bill: careMonthBill\(billRows, kid\.booking_id, month\)/);
  const desk = src("src/components/daily-care-desk.tsx");
  assert.match(desk, /data-ke="licensed-month-bill"/);
  assert.match(desk, /data-ke="licensed-month-estimate"/);
  assert.match(desk, /role === "provider" && dollars && child\.parentUserId && !child\.bill/);
});

test("N-09: store builds show bills and PDFs, with no pay wording or dead end", () => {
  const note = src("src/components/native-pay-note.tsx");
  assert.doesNotMatch(note, /Payments are not part of this app|paiements ne font pas partie/);
  const visible = (note.match(/"[^"]*\s[^"]*"/g) ?? []).join(" ");
  assert.doesNotMatch(visible, /\bpay|payer|paiement/i);
  assert.match(note, /"\/fr\/invoices" : "\/invoices"/);
  assert.match(note, /data-ke="native-pay-bills"/);
  const invoices = src("src/components/stripe-invoice-list.tsx");
  const payButtons = invoices.match(/<a href=\{(invoice\.payPath|invoice\.hostedInvoiceUrl|payHref)\}[^>]*>\s*\{t\("invoicePay"\)\}/g) ?? [];
  assert.equal(payButtons.length, 3);
  for (const link of payButtons) assert.match(link, /data-ke="native-checkout"/);
  assert.match(NATIVE_COMMERCE_SELECTORS, /a\[href\*='invoice\.stripe\.com'\]/);
  assert.match(NATIVE_COMMERCE_SELECTORS, /\[data-ke='native-checkout'\]/);
});
