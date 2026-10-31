/**
 * No-JS invoice list used by the print route test and as the markup contract
 * for the React list (same status words, PDF path, and print control).
 */

import type { InvoiceLocale, ParentInvoiceStatus } from "./stripe-parent-invoice.ts";
import { formatInvoiceMoney, invoiceStatusLabel } from "./stripe-parent-invoice.ts";

export type InvoiceListRow = {
  id: string;
  number: string;
  amountCents: number | null;
  currency: string;
  status: ParentInvoiceStatus;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  daycareName: string | null;
};

export function invoiceListHtml(invoices: readonly InvoiceListRow[], locale: InvoiceLocale = "en"): string {
  const fr = locale === "fr";
  const title = fr ? "Factures" : "Invoices";
  const lead = fr
    ? "KidEase garde les factures de votre garderie. Voyez ce qui est ouvert, payé ou échoué."
    : "KidEase keeps the invoices your daycare sends. See what is open, paid, or failed.";
  const next = fr
    ? "Ouvrez une facture pour payer, ou téléchargez le PDF."
    : "Open an invoice to pay, or download the PDF.";
  const help = fr ? "Aide" : "Help";
  const helpHref = fr ? "/fr/help" : "/help";
  const rows = invoices
    .map((invoice) => {
      const money = formatInvoiceMoney(invoice.amountCents, invoice.currency, locale);
      const label = invoiceStatusLabel(invoice.status, locale);
      const pay =
        invoice.status === "open" && invoice.hostedInvoiceUrl
          ? `<a class="pay" href="${escapeAttr(invoice.hostedInvoiceUrl)}">${fr ? "Payer la facture" : "Pay invoice"}</a>`
          : "";
      const detail = fr ? `/fr/invoices/${encodeURIComponent(invoice.id)}?print=1` : `/invoices/${encodeURIComponent(invoice.id)}?print=1`;
      return `<li data-ke="invoice-row" data-status="${invoice.status}">
        <div>
          <strong>${escapeHtml(invoice.number)}</strong>
          <span class="badge" data-ke="invoice-status">${escapeHtml(label)}</span>
          <p>${escapeHtml(invoice.daycareName || (fr ? "Garderie" : "Daycare"))}${money ? ` · ${escapeHtml(money)}` : ""}</p>
        </div>
        <div class="actions">
          ${pay}
          <a data-ke="invoice-pdf" data-invoice="${escapeAttr(invoice.id)}" href="/api/invoices/${encodeURIComponent(invoice.id)}/pdf">${fr ? "Télécharger le PDF" : "Download PDF"}</a>
          <a data-ke="invoice-print" href="${detail}">${fr ? "Imprimer" : "Print"}</a>
        </div>
      </li>`;
    })
    .join("");
  const empty = invoices.length
    ? ""
    : `<p data-ke="invoice-empty">${fr ? "Aucune facture pour l’instant." : "No invoices yet."} <a href="${fr ? "/fr/search" : "/search"}">${fr ? "Trouver une garderie" : "Find care"}</a></p>`;
  return `<!doctype html>
<html lang="${fr ? "fr" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · KidEase</title>
  <style>
    body { font-family: Georgia, serif; margin: 0; color: #1c1917; background: #faf7f2; }
    main { width: min(40rem, 100%); margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    h1 { font-size: 2rem; margin: 0.25rem 0; }
    .lead, .next { color: #57534e; }
    .help { display: inline-flex; min-height: 44px; align-items: center; margin-top: 1rem; }
    ul { list-style: none; padding: 0; margin: 1.5rem 0 0; }
    li { background: #fff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 1rem; margin-bottom: 0.75rem; }
    .badge { display: inline-block; margin-left: 0.5rem; border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.75rem; background: #ecfdf3; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
    a { min-height: 44px; display: inline-flex; align-items: center; }
    .pay { background: #0f766e; color: white; text-decoration: none; border-radius: 999px; padding: 0 1rem; }
  </style>
</head>
<body>
  <main>
    <p>KidEase</p>
    <h1>${title}</h1>
    <p class="lead">${lead}</p>
    <p class="next">${next}</p>
    <a class="help" data-ke="invoice-help" href="${helpHref}">${help}</a>
    ${empty}
    <ul>${rows}</ul>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
