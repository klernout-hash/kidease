import { dollarsToCents, type BillStatus } from "./bill.ts";
import type { InvoiceSettlementStatus } from "./invoice-read-model.ts";

export type CareMonthBillRow = {
  id: string;
  booking_id: string | null;
  period: string | null;
  status: string;
  settlement_status?: InvoiceSettlementStatus;
  amount_cents: number | string | null;
  total: number | string | null;
  currency: string | null;
  created_at?: string | Date | null;
};

export type CareMonthBill = {
  id: string;
  status: Exclude<BillStatus, "draft"> | "partial";
  currency: string;
  amountCents: number;
};

const SHOWN = new Set(["sent", "paid", "void", "refunded", "disputed"]);

export function invoiceDisplayCents(row: Pick<CareMonthBillRow, "amount_cents" | "total">): number {
  return row.amount_cents == null ? dollarsToCents(Number(row.total)) : Number(row.amount_cents);
}

function stamp(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Most recent published bill for this booking and month. */
export function careMonthBill(rows: readonly CareMonthBillRow[], bookingId: string, month: string): CareMonthBill | null {
  const hit = rows
    .filter((row) => row.booking_id === bookingId && String(row.period || "").slice(0, 7) === month && SHOWN.has(row.status))
    .sort((a, b) => stamp(b.created_at) - stamp(a.created_at) || b.id.localeCompare(a.id))[0];
  if (!hit) return null;
  return { id: hit.id, status: hit.settlement_status === "partial" || hit.settlement_status === "refunded" ? hit.settlement_status : hit.status as CareMonthBill["status"], amountCents: invoiceDisplayCents(hit), currency: hit.currency || "cad" };
}

export function careMonthBillCopy(locale: string) {
  const fr = locale === "fr";
  return {
    billed: (amount: string) => (fr ? `Facturé : ${amount}` : `Billed: ${amount}`),
    status: (status: CareMonthBill["status"]) =>
      (fr
        ? { sent: "à payer", paid: "payée", partial: "remboursée en partie", void: "annulée", refunded: "remboursée", disputed: "contestée" }
        : { sent: "due", paid: "paid", partial: "partially refunded", void: "void", refunded: "refunded", disputed: "disputed" })[status],
    estimate: fr
      ? "Estimation selon les présences."
      : "Estimate from attendance.",
    seeBill: fr ? "Voir la facture" : "See the bill",
  };
}
