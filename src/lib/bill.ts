/** KidEase bill statuses. User-facing words: Bill / Pay / Paid. */
export type BillStatus = "draft" | "sent" | "paid" | "void" | "refunded" | "disputed";

export const BILL_STATUSES: readonly BillStatus[] = ["draft", "sent", "paid", "void", "refunded", "disputed"];

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

/** Provider copy: “You receive $X” after the KidEase platform fee. */
export function receiveCents(amountCents: number, platformFeeCents?: number): number {
  if (platformFeeCents != null && Number.isFinite(platformFeeCents)) {
    return Math.max(0, amountCents - platformFeeCents);
  }
  return Math.max(0, amountCents - Math.round((amountCents * 300) / 10000));
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
