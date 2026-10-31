/**
 * Branded invoice PDF. Stripe's invoice_pdf is preferred when we have it,
 * because that file already shows Paid. This fallback stamps PAID ourselves.
 * No extra library. scripts/stripe-invoices.test.mjs loads this file.
 */

import type { InvoiceLocale, ParentInvoiceStatus } from "./stripe-parent-invoice.ts";
import { formatInvoiceMoney, invoiceStatusLabel } from "./stripe-parent-invoice.ts";

export type InvoicePdfInput = {
  id: string;
  number: string;
  amountCents: number | null;
  currency: string;
  status: ParentInvoiceStatus;
  paidAt: string | null;
  daycareName?: string | null;
  locale?: InvoiceLocale;
};

const FOLDS: Record<string, string> = {
  "\u00e9": "e",
  "\u00e8": "e",
  "\u00ea": "e",
  "\u00e0": "a",
  "\u00f9": "u",
  "\u00f4": "o",
  "\u00ee": "i",
  "\u00e7": "c",
  "\u00c9": "E",
  "\u2019": "'",
  "\u00a0": " ",
};

function fold(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code > 126) {
      out += FOLDS[char] || "";
      continue;
    }
    out += char === "(" || char === ")" || char === "\\" ? `\\${char}` : char;
  }
  return out;
}

export function invoicePdfLines(invoice: InvoicePdfInput): string[] {
  const locale = invoice.locale === "fr" ? "fr" : "en";
  const fr = locale === "fr";
  const money = formatInvoiceMoney(invoice.amountCents, invoice.currency, locale);
  const lines = [
    "KidEase",
    fr ? "Facture de garderie" : "Daycare invoice",
    `${fr ? "Facture" : "Invoice"} ${invoice.number}`,
    invoice.daycareName ? `${fr ? "Garderie" : "Daycare"}: ${invoice.daycareName}` : "",
    money ? `${fr ? "Montant" : "Amount"}: ${money}` : "",
    `${fr ? "Statut" : "Status"}: ${invoiceStatusLabel(invoice.status, locale)}`,
    invoice.status === "paid" ? "PAID" : "",
    invoice.paidAt ? `${fr ? "Date" : "Date"}: ${invoice.paidAt.slice(0, 10)}` : "",
  ];
  return lines.filter(Boolean);
}

/** One-page PDF. Paid invoices include the ASCII word PAID. */
export function brandedInvoicePdf(invoice: InvoicePdfInput): Uint8Array {
  const lines = invoicePdfLines(invoice);
  const commands: string[] = [];
  if (invoice.status === "paid") {
    commands.push("BT /F2 28 Tf 380 720 Td (PAID) Tj ET");
  }
  lines.slice(0, 36).forEach((line, index) => {
    const y = 700 - index * 18;
    const size = index === 0 ? 18 : 12;
    const font = index === 0 ? "F2" : "F1";
    commands.push(`BT /${font} ${size} Tf 56 ${y} Td (${fold(line).slice(0, 90)}) Tj ET`);
  });
  const stream = `${commands.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function invoicePdfFilename(number: string): string {
  const safe = number.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "invoice";
  return `kidease-${safe}.pdf`;
}

/**
 * Authorized download. Stripe's PDF wins when the URL is https, including
 * after it is paid. Otherwise we return our branded file.
 */
export function invoicePdfHttpResponse(input: {
  invoice: (InvoicePdfInput & { invoicePdf?: string | null }) | null;
  authorized: boolean;
}): Response {
  if (!input.authorized) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  }
  if (!input.invoice) {
    return Response.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }
  const stripePdf = input.invoice.invoicePdf;
  if (stripePdf && stripePdf.startsWith("https://")) {
    return Response.redirect(stripePdf, 302);
  }
  const bytes = brandedInvoicePdf(input.invoice);
  const filename = invoicePdfFilename(input.invoice.number);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
