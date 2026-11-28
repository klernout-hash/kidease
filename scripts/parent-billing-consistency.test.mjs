import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { savePdfBytes, savePdfFailedText } from "../src/lib/save-pdf.ts";
import { careMonthBill, careMonthBillCopy, invoiceDisplayCents } from "../src/lib/care-month-bill.ts";
import { formatInvoiceDisplayMoney } from "../src/lib/stripe-parent-invoice.ts";
import { NATIVE_COMMERCE_SELECTORS } from "../src/lib/native-entitlements.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const pdf = new Uint8Array([37, 80, 68, 70]);

test("P1-5: website starts one PDF download", async () => {
  let downloads = 0;
  const result = await savePdfBytes(pdf, "a.pdf", {
    native: false,
    download: () => { downloads += 1; return true; },
  });
  assert.equal(result, "started");
  assert.equal(downloads, 1);
});

test("P1-5: native shares one PDF and suppresses a second tap while open", async () => {
  let release;
  const files = [];
  const env = {
    native: true,
    shareFile: (bytes, filename) => new Promise((resolve) => {
      files.push({ bytes, filename });
      release = resolve;
    }),
    download: () => assert.fail("native download attempted"),
  };
  const first = savePdfBytes(pdf, "receipt.pdf", env);
  assert.equal(await savePdfBytes(pdf, "receipt.pdf", env), "busy");
  release();
  assert.equal(await first, "started");
  assert.deepEqual(files, [{ bytes: pdf, filename: "receipt.pdf" }]);
});

test("P1-5: failures and cancellations are distinct, and the next tap can retry", async () => {
  const env = (message) => ({ native: true, shareFile: async () => { throw new Error(message); } });
  assert.equal(await savePdfBytes(pdf, "a.pdf", env("Share canceled")), "cancelled");
  assert.equal(await savePdfBytes(pdf, "a.pdf", env("Could not prepare PDF")), "failed");
  assert.equal(await savePdfBytes(pdf, "a.pdf", { native: true, shareFile: async () => {} }), "started");
  assert.match(savePdfFailedText("fr"), /navigateur/);
  assert.match(savePdfFailedText("en"), /browser/);
});

test("P1-5: PDF actions use the shared saver, and receipt requests do not claim a download", () => {
  assert.match(src("src/components/stripe-invoice-list.tsx"), /savePdfBytes\(bytes, invoicePdfFilename/);
  const tax = src("src/components/tax-receipt-studio.tsx");
  assert.match(tax, /savePdfBytes\(base64ToBytes\(result\.pdfBase64\)/);
  assert.doesNotMatch(tax, /taxSaved|celebrate\(/);
  for (const route of ["invoices.$id", "fr.invoices.$id"]) {
    assert.match(src(`src/routes/${route}.tsx`), /navigate\(\{ replace: true, search: \{\} \}\).*window\.print/);
  }
});

test("P1-6: the month summary shows the sent bill from invoices, not a second number", () => {
  const rows = [
    { id: "inv_old", booking_id: "bk_1", period: "2026-11", status: "void", amount_cents: 1000, total: 10, created_at: "2026-11-02" },
    { id: "inv_draft", booking_id: "bk_1", period: "2026-11", status: "draft", amount_cents: 9999, total: 99.99, created_at: "2026-11-29" },
    { id: "inv_sent", booking_id: "bk_1", period: "2026-11", status: "sent", amount_cents: null, total: "412.50", created_at: "2026-11-28" },
    { id: "inv_oct", booking_id: "bk_1", period: "2026-10", status: "paid", amount_cents: 40000, total: 400, created_at: "2026-10-30" },
    { id: "inv_other", booking_id: "bk_2", period: "2026-11", status: "paid", amount_cents: 5000, total: 50, created_at: "2026-11-30" },
  ];
  assert.deepEqual(careMonthBill(rows, "bk_1", "2026-11"), { id: "inv_sent", status: "sent", amountCents: 41250, currency: "cad" });
  assert.deepEqual(careMonthBill(rows, "bk_1", "2026-10"), { id: "inv_oct", status: "paid", amountCents: 40000, currency: "cad" });
  assert.equal(careMonthBill(rows, "bk_1", "2026-09"), null);
  assert.equal(careMonthBill(rows, "bk_3", "2026-11"), null);
  assert.equal(formatInvoiceDisplayMoney(41250, "cad", "en"), "CA$412.50");
  assert.match(careMonthBillCopy("fr").billed(formatInvoiceDisplayMoney(41250, "cad", "fr")), /^Facturé : 412,50\s\$\sCA$/);
  assert.match(careMonthBillCopy("en").estimate, /Estimate/);
  assert.equal(invoiceDisplayCents({ amount_cents: "0", total: 412.50 }), 0);
  assert.equal(invoiceDisplayCents({ amount_cents: null, total: "412.50" }), 41250);
  assert.equal(careMonthBill(rows.slice(0, 2), "bk_1", "2026-11").status, "void");
});

test("P1-6: getLicensedMonth reads the invoices table read-only, scoped to family or authorised billing staff", () => {
  const care = src("src/lib/server/care-ops.ts");
  assert.match(care, /from \$\{INVOICE_READ_MODEL_SQL\} i\s+where booking_id = any\(\$1::text\[\]\) and period = \$2 and status <> 'draft'/);
  assert.match(care, /parent_user_id = \$3 or daycare_id = any\(\$4::text\[\]\)/);
  assert.match(src("src/lib/server/stripe-parent-invoices.ts"), /i\.read_amount_cents as amount_cents/);
  assert.match(care, /bill: careMonthBill\(billRows, kid\.booking_id, month\)/);
  const desk = src("src/components/daily-care-desk.tsx");
  assert.match(desk, /data-ke="licensed-month-bill"/);
  assert.match(desk, /data-ke="licensed-month-estimate"/);
  assert.match(desk, /role === "provider" && dollars && child\.parentUserId/);
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
