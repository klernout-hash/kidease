/**
 * Childcare books. Parent fees land here from rows KidEase already stored.
 * No Stripe call. The tax account is not this ledger.
 */

import type { JournalEntry, JournalLine } from "./ledger.ts";
import { salesTaxOnExtra } from "./calculate.ts";

export const CHART = [
  { code: "parent_fees", nameEn: "Parent fees", nameFr: "Frais des parents", kind: "income" },
  { code: "subsidy", nameEn: "Subsidy", nameFr: "Subvention", kind: "income" },
  { code: "taxable_extras", nameEn: "Taxable extras", nameFr: "Extras taxables", kind: "income" },
  { code: "wages", nameEn: "Staff pay", nameFr: "Paie du personnel", kind: "expense" },
  { code: "employer_cost", nameEn: "Centre's share of government money", nameFr: "Part du centre pour le gouvernement", kind: "expense" },
  { code: "provider_stripe", nameEn: "Centre Stripe balance", nameFr: "Solde Stripe du centre", kind: "asset" },
  { code: "net_wages_payable", nameEn: "Pay still to send", nameFr: "Paie à envoyer", kind: "liability" },
  { code: "government_payable", nameEn: "Government money to set aside", nameFr: "Argent du gouvernement à mettre de côté", kind: "liability" },
  { code: "trust_reference", nameEn: "Tax account (not KidEase)", nameFr: "Compte de taxe (pas KidEase)", kind: "asset" },
  { code: "gst_hst_payable", nameEn: "Sales tax on extras", nameFr: "Taxe sur les extras", kind: "liability" },
] as const;

export type StoredInvoice = {
  id: string;
  daycareId: string;
  amountCents: number;
  kind: "care" | "extra" | "subsidy";
  province: string;
  at: string;
};

export function invoiceJournal(invoice: StoredInvoice): JournalEntry {
  const tax = invoice.kind === "extra" ? salesTaxOnExtra(invoice.province, invoice.amountCents, true) : salesTaxOnExtra(invoice.province, invoice.amountCents, false);
  const income = invoice.kind === "subsidy" ? "subsidy" : invoice.kind === "extra" ? "taxable_extras" : "parent_fees";
  const lines: JournalLine[] = [
    { account: "provider_stripe", debitCents: invoice.amountCents + tax.cents, creditCents: 0 },
    { account: income, debitCents: 0, creditCents: invoice.amountCents },
  ];
  if (tax.cents > 0) lines.push({ account: "gst_hst_payable", debitCents: 0, creditCents: tax.cents });
  return {
    id: `invoice:${invoice.id}`,
    daycareId: invoice.daycareId,
    ledger: "books",
    memo: invoice.kind === "care" ? "Parent fee. No sales tax." : invoice.kind === "subsidy" ? "Subsidy." : "Taxable extra.",
    lines,
    at: invoice.at,
  };
}

export type Statement = {
  incomeCents: number;
  expenseCents: number;
  surplusCents: number;
  stripeCents: number;
  salesTaxCents: number;
  careExempt: true;
};

export function booksStatement(entries: readonly JournalEntry[], daycareId: string): Statement {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.daycareId !== daycareId || entry.ledger !== "books") continue;
    for (const line of entry.lines) {
      totals[line.account] = (totals[line.account] ?? 0) + line.creditCents - line.debitCents;
    }
  }
  const income = (totals.parent_fees ?? 0) + (totals.subsidy ?? 0) + (totals.taxable_extras ?? 0);
  const expense = (totals.wages ?? 0) + (totals.employer_cost ?? 0);
  return {
    incomeCents: income,
    expenseCents: expense,
    surplusCents: income - expense,
    stripeCents: -1 * (totals.provider_stripe ?? 0) + (totals.provider_stripe ? 0 : 0) + ((totals.provider_stripe ?? 0) < 0 ? -(totals.provider_stripe ?? 0) : totals.provider_stripe ?? 0),
    salesTaxCents: totals.gst_hst_payable ?? 0,
    careExempt: true,
  };
}

/** Asset balance is debit-normal. Restate Stripe as the debit balance. */
export function stripeBalance(entries: readonly JournalEntry[], daycareId: string): number {
  let debit = 0;
  let credit = 0;
  for (const entry of entries) {
    if (entry.daycareId !== daycareId || entry.ledger !== "books") continue;
    for (const line of entry.lines) {
      if (line.account !== "provider_stripe") continue;
      debit += line.debitCents;
      credit += line.creditCents;
    }
  }
  return debit - credit;
}

export function xeroCsv(entries: readonly JournalEntry[]): string {
  const header = "date,ledger,account,debit_cents,credit_cents,memo,external";
  const rows = entries.map((entry) =>
    entry.lines
      .map((line) =>
        [entry.at.slice(0, 10), entry.ledger, line.account, line.debitCents, line.creditCents, entry.memo.replaceAll(",", " "), "not_sent"].join(","),
      )
      .join("\n"),
  );
  return [header, ...rows].join("\n");
}

export function yearEndCsv(rows: readonly Record<string, string | number>[]): string {
  if (!rows.length) return "note\nNo rows. Nothing was filed.";
  const keys = Object.keys(rows[0]);
  const body = rows.map((row) => keys.map((key) => String(row[key] ?? "").replaceAll(",", " ")).join(","));
  return [keys.join(","), ...body, "note,Export only. Not filed with CRA or Revenu Québec."].join("\n");
}
