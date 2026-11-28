/**
 * Daily care month summary reads the same `invoices` rows as Pay and Bill history (P1-6).
 * The attendance total is only an estimate until a bill is sent. Once a bill exists for
 * that child and month, the summary shows the bill amount in CA$, not a second number.
 * Read-only: nothing here charges, sends, or changes a bill.
 */

export type CareMonthBillRow = {
  id: string;
  booking_id: string | null;
  period: string | null;
  status: string;
  amount_cents: number | string | null;
  total: number | string | null;
  created_at?: string | Date | null;
};

export type CareMonthBill = {
  id: string;
  status: "sent" | "paid" | "refunded" | "disputed";
  amountCents: number;
};

const SHOWN = new Set(["sent", "paid", "refunded", "disputed"]);

function cents(row: CareMonthBillRow): number {
  if (row.amount_cents != null && row.amount_cents !== "") return Math.round(Number(row.amount_cents)) || 0;
  return Math.round((Number(row.total) || 0) * 100);
}

function stamp(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Newest sent / paid bill for this booking and YYYY-MM period. Drafts and voided bills are not shown. */
export function careMonthBill(rows: readonly CareMonthBillRow[], bookingId: string, month: string): CareMonthBill | null {
  const hit = rows
    .filter((row) => row.booking_id === bookingId && String(row.period || "").slice(0, 7) === month && SHOWN.has(row.status))
    .sort((a, b) => stamp(b.created_at) - stamp(a.created_at))[0];
  if (!hit) return null;
  return { id: hit.id, status: hit.status as CareMonthBill["status"], amountCents: cents(hit) };
}

export function careMonthBillCopy(locale: string) {
  const fr = locale === "fr";
  return {
    billed: (amount: string) => (fr ? `Facturé : ${amount}` : `Billed: ${amount}`),
    status: (status: CareMonthBill["status"]) =>
      fr
        ? status === "paid"
          ? "payée"
          : status === "refunded"
            ? "remboursée"
            : status === "disputed"
              ? "contestée"
              : "à payer"
        : status === "paid"
          ? "paid"
          : status === "refunded"
            ? "refunded"
            : status === "disputed"
              ? "disputed"
              : "due",
    estimate: fr
      ? "Estimation selon les présences. Ce n’est pas une facture."
      : "Estimate from attendance. This is not a bill.",
    seeBill: fr ? "Voir la facture" : "See the bill",
  };
}
