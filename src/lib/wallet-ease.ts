/**
 * Payment ease (PE-1, PE-4, PE-5, PE-8): saved-method paging, default re-pick,
 * expiry warnings, PAD mandate display, micro-deposit next step, the one-time
 * bill retry after a card update, and partial refunds. No package imports:
 * node:test loads this file without node_modules.
 */

/* --------------------------------- PE-1 paging -------------------------------- */

export const WALLET_PAGE_SIZE = 100;
/** Safety cap across all pages, per payment method type. */
export const WALLET_MAX_METHODS = 100;

export type StripeListPage<T> = { data?: T[]; has_more?: boolean };

/**
 * Page a Stripe list with starting_after until has_more is false.
 * Stops at `cap` rows even when Stripe says there are more.
 */
export async function listAllStripePages<T extends { id?: string }>(
  fetchPage: (startingAfter: string | null, limit: number) => Promise<StripeListPage<T>>,
  cap = WALLET_MAX_METHODS,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  for (let guard = 0; guard < cap; guard += 1) {
    const page = await fetchPage(after, Math.min(WALLET_PAGE_SIZE, cap - out.length));
    const rows = page?.data || [];
    for (const row of rows) {
      if (out.length >= cap) return out;
      out.push(row);
    }
    const last = rows[rows.length - 1]?.id || null;
    if (!page?.has_more || !last || out.length >= cap) return out;
    after = last;
  }
  return out;
}

/* ------------------------------ PE-1 default re-pick ----------------------------- */

export type RemainingMethod = { id: string; kind: string; created?: number | null };

export type RemovePlan = {
  wasDefault: boolean;
  /** New default payment method, or null. */
  newDefaultId: string | null;
  /** True when the default was removed and nothing is left: automatic pay turns off. */
  clearAutopay: boolean;
};

/**
 * Removing the default picks the newest remaining card. With no card left,
 * the newest remaining method (a bank debit). With nothing left, autopay ends.
 */
export function planRemoveMethod(input: { removedId: string; defaultId: string | null; remaining: RemainingMethod[] }): RemovePlan {
  const wasDefault = Boolean(input.defaultId) && input.defaultId === input.removedId;
  if (!wasDefault) return { wasDefault: false, newDefaultId: null, clearAutopay: false };
  const left = input.remaining.filter((method) => method.id && method.id !== input.removedId);
  const newest = (rows: RemainingMethod[]) => [...rows].sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0))[0];
  const cards = left.filter((method) => method.kind !== "acss_debit");
  const pick = newest(cards) || newest(left) || null;
  return { wasDefault: true, newDefaultId: pick?.id ?? null, clearAutopay: !pick };
}

/* -------------------------------- PE-1 expiry ------------------------------- */

export type ExpiryStatus = "ok" | "soon" | "expired";

export const EXPIRES_SOON_DAYS = 60;

/** A card works through the last day of its expiry month (UTC). */
export function expiryStatus(expMonth: number | null | undefined, expYear: number | null | undefined, now = new Date()): ExpiryStatus | null {
  const month = Number(expMonth);
  const year = Number(expYear);
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12 || year < 2000) return null;
  const lastMoment = Date.UTC(year, month, 1) - 1; // last ms of the expiry month
  const left = lastMoment - now.getTime();
  if (left < 0) return "expired";
  if (left <= EXPIRES_SOON_DAYS * 86_400_000) return "soon";
  return "ok";
}

export function expiresSoon(expMonth: number | null | undefined, expYear: number | null | undefined, now = new Date()): boolean {
  return expiryStatus(expMonth, expYear, now) === "soon";
}

/* --------------------------------- PE-4 mandate ------------------------------- */

export type MandateView = {
  id: string;
  status: "active" | "inactive" | "pending";
  acceptedAt: string | null;
  url: string | null;
  schedule: string | null;
  transactionType: string | null;
};

type StripeMandate = {
  id?: string;
  status?: string | null;
  customer_acceptance?: { accepted_at?: number | null } | null;
  payment_method_details?: {
    acss_debit?: { url?: string | null; payment_schedule?: string | null; transaction_type?: string | null } | null;
  } | null;
};

/** Only an https Stripe-hosted agreement link is shown. */
function safeAgreementUrl(raw: string | null | undefined): string | null {
  const url = String(raw || "").trim();
  return /^https:\/\/[a-z0-9.-]+\.stripe\.com\//i.test(url) ? url : null;
}

export function shapeMandateView(raw: StripeMandate | null | undefined): MandateView | null {
  const id = String(raw?.id || "").trim();
  if (!id.startsWith("mandate_")) return null;
  const status = raw?.status === "active" || raw?.status === "inactive" ? raw.status : "pending";
  const accepted = Number(raw?.customer_acceptance?.accepted_at);
  const acss = raw?.payment_method_details?.acss_debit;
  return {
    id,
    status,
    acceptedAt: Number.isFinite(accepted) && accepted > 0 ? new Date(accepted * 1000).toISOString() : null,
    url: safeAgreementUrl(acss?.url),
    schedule: acss?.payment_schedule ? String(acss.payment_schedule) : null,
    transactionType: acss?.transaction_type ? String(acss.transaction_type) : null,
  };
}

export type SetupNextStep =
  | { kind: "done"; paymentMethodId: string | null }
  | { kind: "verify_microdeposits"; url: string | null; arrivalDate: string | null; paymentMethodId: string | null }
  | { kind: "pending"; paymentMethodId: string | null };

type SetupIntentLike = {
  status?: string | null;
  payment_method?: string | { id?: string } | null;
  next_action?: {
    type?: string | null;
    verify_with_microdeposits?: { hosted_verification_url?: string | null; arrival_date?: number | null } | null;
  } | null;
};

/** After confirmSetup: saved, still verifying, or "Verify deposits" for a bank debit (PAD). */
export function setupNextStep(intent: SetupIntentLike | null | undefined): SetupNextStep {
  const pm = intent?.payment_method;
  const paymentMethodId = typeof pm === "string" ? pm : pm?.id || null;
  if (intent?.next_action?.type === "verify_with_microdeposits") {
    const raw = String(intent.next_action.verify_with_microdeposits?.hosted_verification_url || "").trim();
    const arrival = Number(intent.next_action.verify_with_microdeposits?.arrival_date);
    return {
      kind: "verify_microdeposits",
      url: /^https:\/\/[a-z0-9.-]+\.stripe\.com\//i.test(raw) ? raw : null,
      arrivalDate: Number.isFinite(arrival) && arrival > 0 ? new Date(arrival * 1000).toISOString().slice(0, 10) : null,
      paymentMethodId,
    };
  }
  if (intent?.status === "processing" || intent?.status === "requires_action") return { kind: "pending", paymentMethodId };
  return { kind: "done", paymentMethodId };
}

/* --------------------------------- PE-5 retry -------------------------------- */

export type RetryPlan =
  | { ok: true; path: string; body: Record<string, unknown>; idempotencyKey: string }
  | { ok: false; reason: "not_failed" | "not_owner" | "no_invoice" | "live_off" | "bad_method" };

/**
 * After a new card is saved from the update-card link, pay that bill once.
 * Only a bill in payment_state 'failed' with a Stripe invoice is retried.
 * The idempotency key ties the retry to this failure, so it runs once.
 * Live retries stay off unless KIDEASE_BILL_RETRY_LIVE is exactly 1.
 */
export function planBillRetry(input: {
  billId: string;
  actorUserId: string;
  parentUserId: string;
  status: string;
  paymentState: string | null;
  failedAt: string | null;
  stripeInvoiceId: string | null;
  paymentMethodId: string;
  mode: "test" | "live";
  liveRetryOn: boolean;
}): RetryPlan {
  if (input.actorUserId !== input.parentUserId) return { ok: false, reason: "not_owner" };
  if (input.status !== "sent" || input.paymentState !== "failed") return { ok: false, reason: "not_failed" };
  if (!String(input.paymentMethodId || "").startsWith("pm_")) return { ok: false, reason: "bad_method" };
  const invoiceId = String(input.stripeInvoiceId || "");
  if (!invoiceId.startsWith("in_")) return { ok: false, reason: "no_invoice" };
  if (input.mode === "live" && !input.liveRetryOn) return { ok: false, reason: "live_off" };
  const failure = input.failedAt ? String(Date.parse(input.failedAt) || input.failedAt) : "none";
  return {
    ok: true,
    path: `/invoices/${encodeURIComponent(invoiceId)}/pay`,
    body: { payment_method: input.paymentMethodId, off_session: true },
    idempotencyKey: `bill-retry-${input.mode}-${input.billId}-${failure}`,
  };
}

/* ------------------------------- PE-8 refunds ------------------------------- */

export type RefundState = "partly_refunded" | "refunded";

export type RefundPlan = {
  refundedCents: number;
  refundState: RefundState | null;
  /** Bill status: refunded only for a full refund. */
  fullRefund: boolean;
  methodLabel: string | null;
};

type ChargeLike = {
  amount?: number | null;
  amount_refunded?: number | null;
  refunded?: boolean | null;
  payment_method_details?: {
    type?: string | null;
    card?: { brand?: string | null; last4?: string | null } | null;
    acss_debit?: { bank_name?: string | null; last4?: string | null } | null;
  } | null;
};

function brandLabel(raw: string | null | undefined): string {
  const brand = String(raw || "").trim().toLowerCase();
  const names: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", interac: "Interac" };
  return names[brand] || (brand ? brand[0]!.toUpperCase() + brand.slice(1) : "Card");
}

/** charge.refunded: full when amount_refunded reaches the charge amount, partial otherwise. */
export function planRefund(charge: ChargeLike | null | undefined): RefundPlan {
  const amount = Math.max(0, Math.round(Number(charge?.amount) || 0));
  const refunded = Math.max(0, Math.round(Number(charge?.amount_refunded) || 0));
  const fullRefund = charge?.refunded === true || (amount > 0 && refunded >= amount);
  const card = charge?.payment_method_details?.card;
  const bank = charge?.payment_method_details?.acss_debit;
  const last4 = String(card?.last4 || bank?.last4 || "").trim();
  const methodLabel = /^\d{4}$/.test(last4)
    ? `${card ? brandLabel(card.brand) : String(bank?.bank_name || "").trim() || "Bank"} ···· ${last4}`
    : null;
  if (refunded <= 0 && !fullRefund) return { refundedCents: 0, refundState: null, fullRefund: false, methodLabel };
  return {
    refundedCents: fullRefund && refunded === 0 ? amount : refunded,
    refundState: fullRefund ? "refunded" : "partly_refunded",
    fullRefund,
    methodLabel,
  };
}

export function parseRefundState(raw: unknown): RefundState | null {
  return raw === "partly_refunded" || raw === "refunded" ? raw : null;
}
