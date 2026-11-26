/**
 * Branded invoice PDF. Stripe's invoice_pdf is preferred when we have it,
 * because that file already shows Paid. This fallback stamps PAID ourselves.
 * No extra library. scripts/stripe-invoices.test.mjs loads this file.
 */

import type { InvoiceLocale, ParentInvoiceStatus } from "./stripe-parent-invoice.ts";
import { formatInvoiceMoney, invoiceStatusLabel } from "./stripe-parent-invoice.ts";
import { pdfEscape } from "./gov/pdf.ts";

export type InvoicePdfInput = {
  id: string;
  number: string;
  amountCents: number | null;
  currency: string;
  status: ParentInvoiceStatus;
  paidAt: string | null;
  daycareName?: string | null;
  /** Street, city, province, postal code. Home daycares that hide the street pass city and province only. */
  daycareAddress?: string | null;
  locale?: InvoiceLocale;
};

/** Amount with an explicit CAD marker in both languages ("$1.00 CAD", "1,00 $ CA"). */
export function invoicePdfMoney(
  cents: number | null,
  currency: string,
  locale: InvoiceLocale,
): string | null {
  const text = formatInvoiceMoney(cents, currency, locale);
  if (!text) return null;
  const code = /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : "CAD";
  if (code !== "CAD") return text;
  if (locale === "fr") return text; // formatCad already ends in "$ CA"
  return /CA\$|CAD/.test(text) ? text : `${text} CAD`;
}

export function invoicePdfLines(invoice: InvoicePdfInput): string[] {
  const locale = invoice.locale === "fr" ? "fr" : "en";
  const fr = locale === "fr";
  const money = invoicePdfMoney(invoice.amountCents, invoice.currency, locale);
  const lines = [
    "KidEase",
    fr ? "Facture de garde d’enfants" : "Child care invoice",
    `${fr ? "Facture" : "Invoice"} ${invoice.number}`,
    invoice.daycareName ? `${fr ? "Centre : " : "Centre: "}${invoice.daycareName}` : "",
    invoice.daycareAddress ? `${fr ? "Adresse : " : "Address: "}${invoice.daycareAddress}` : "",
    money ? `${fr ? "Montant : " : "Amount: "}${money}` : "",
    fr
      ? "TPS/TVH : aucune taxe facturée (les services de garde d’enfants sont exonérés)."
      : "GST/HST: no tax charged (child care services are tax-exempt).",
    `${fr ? "Statut : " : "Status: "}${invoiceStatusLabel(invoice.status, locale)}`,
    invoice.paidAt
      ? `${fr ? "Date du paiement : " : "Paid on: "}${invoice.paidAt.slice(0, 10)}`
      : "",
  ];
  return lines.filter(Boolean);
}

/** The stamp on a paid invoice. */
export function invoicePaidStamp(locale: InvoiceLocale | undefined): string {
  return locale === "fr" ? "PAYÉE" : "PAID";
}

/** One-page PDF. Paid invoices carry a PAID / PAYÉE stamp. WinAnsi fonts, so French accents print. */
export function brandedInvoicePdf(invoice: InvoicePdfInput): Uint8Array {
  const lines = invoicePdfLines(invoice);
  const commands: string[] = [];
  if (invoice.status === "paid") {
    commands.push(`BT /F2 28 Tf 380 720 Td (${pdfEscape(invoicePaidStamp(invoice.locale))}) Tj ET`);
  }
  lines.slice(0, 36).forEach((line, index) => {
    const y = 700 - index * 18;
    const size = index === 0 ? 18 : 12;
    const font = index === 0 ? "F2" : "F1";
    commands.push(
      `BT /${font} ${size} Tf 56 ${y} Td (${pdfEscape(Array.from(line).slice(0, 90).join(""))}) Tj ET`,
    );
  });
  const stream = `${commands.join("\n")}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
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
  const safe =
    number
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "invoice";
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
