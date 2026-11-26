import { DEFAULT_PLATFORM_FEE_BPS } from "./stripe-methods.ts";

/** KidEase bill statuses. User-facing words: Bill / Pay / Paid. */
export type BillStatus = "draft" | "sent" | "paid" | "void" | "refunded" | "disputed";

export const BILL_STATUSES: readonly BillStatus[] = [
  "draft",
  "sent",
  "paid",
  "void",
  "refunded",
  "disputed",
];

export type Bill = {
  id: string;
  number: string;
  daycareId: string;
  daycareName: string;
  parentUserId: string;
  parentName: string | null;
  parentEmail: string | null;
  childId: string | null;
  childName: string | null;
  bookingId: string | null;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
  netCents: number;
  period: string;
  dueAt: string | null;
  status: BillStatus;
  memo: string | null;
  receiptUrl: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdBy: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Stripe payment state beside status (processing / requires_action / failed). */
  paymentState?: "processing" | "requires_action" | "failed" | null;
  lastErrorCode?: string | null;
  failedAt?: string | null;
  /** PE-8: refund beside status. partly_refunded keeps the bill Paid. */
  refundState?: "partly_refunded" | "refunded" | null;
  refundedCents?: number | null;
  refundedAt?: string | null;
  refundMethodLabel?: string | null;
};

export function isBillStatus(raw: string): raw is BillStatus {
  return (BILL_STATUSES as readonly string[]).includes(raw);
}

export function parseBillStatus(raw: string | null | undefined): BillStatus {
  const value = raw || "";
  return isBillStatus(value) ? value : "draft";
}

/** Parents never see drafts. */
export function parentCanSeeBill(status: BillStatus): boolean {
  return status !== "draft";
}

export function billIsOpen(status: BillStatus): boolean {
  return status === "sent";
}

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.max(0, Math.round(dollars * 100));
}

export function centsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

export function billDollars(bill: Pick<Bill, "amountCents">): number {
  return centsToDollars(bill.amountCents);
}

/** Same default as the Connect charge. */
const FALLBACK_PLATFORM_FEE_BPS = DEFAULT_PLATFORM_FEE_BPS;

/** Provider copy: “You receive $X” after the KidEase platform fee. */
export function receiveCents(
  amountCents: number,
  platformFeeCents?: number,
  fallbackBps = FALLBACK_PLATFORM_FEE_BPS,
): number {
  if (platformFeeCents != null && Number.isFinite(platformFeeCents)) {
    return Math.max(0, amountCents - platformFeeCents);
  }
  return Math.max(0, amountCents - Math.round((amountCents * fallbackBps) / 10000));
}

export function billStatusLabel(status: BillStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "paid":
      return "Paid";
    case "void":
      return "Void";
    case "refunded":
      return "Refunded";
    case "disputed":
      return "Disputed";
  }
}

export type BillParty = {
  userId: string;
  name: string | null;
  email: string | null;
  daycareId: string;
  daycareName: string;
  children: Array<{ id: string; name: string }>;
  bookings: Array<{ id: string; childName: string | null; monthlyAmount: number }>;
};

export type EarningsSummary = {
  /** Sent and not yet paid, in cents. */
  owedCents: number;
  owedCount: number;
  /** Paid this calendar month (by paid date), net of the KidEase fee, in cents. */
  paidThisMonthCents: number;
  draftCount: number;
};

/** Totals for the top of the Earnings tab. Only real bill rows count. */
export function earningsSummary(
  bills: readonly Pick<Bill, "status" | "amountCents" | "netCents" | "paidAt">[],
  now = new Date(),
): EarningsSummary {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  let owedCents = 0;
  let owedCount = 0;
  let paidThisMonthCents = 0;
  let draftCount = 0;
  for (const bill of bills) {
    if (bill.status === "sent") {
      owedCents += Math.max(0, bill.amountCents);
      owedCount += 1;
    } else if (bill.status === "draft") {
      draftCount += 1;
    } else if (
      bill.status === "paid" &&
      bill.paidAt &&
      (isoOrNull(bill.paidAt) ?? "").slice(0, 7) === month
    ) {
      paidThisMonthCents += Math.max(0, bill.netCents);
    }
  }
  return { owedCents, owedCount, paidThisMonthCents, draftCount };
}

/**
 * Postgres hands timestamptz back as a Date. The client used to get that Date
 * in paidAt and called paidAt.slice(), which crashed the Earnings desk once a
 * bill was paid (Nov 25). Bills always carry ISO strings (or a plain
 * YYYY-MM-DD for a due date).
 */
export function isoOrNull(value: unknown, dateOnly = false): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return dateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  const text = String(value);
  return dateOnly && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}
