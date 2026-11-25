/**
 * Stripe payment states for a KidEase bill (A3). Stored in
 * invoices.payment_state beside BillStatus, so screens that switch on
 * BillStatus are unchanged. No package imports: node:test loads this file.
 */

export type BillPaymentState = "processing" | "requires_action" | "failed";

export const PAYMENT_STATE_EVENT_TYPES = [
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "payment_intent.requires_action",
  "invoice.overdue",
] as const;

export const MANDATE_EVENT_TYPES = ["mandate.updated"] as const;

/** Handled with no bill change (the wallet reads Stripe live). */
export const NO_OP_EVENT_TYPES = ["payment_method.attached"] as const;

export function parsePaymentState(raw: unknown): BillPaymentState | null {
  return raw === "processing" || raw === "requires_action" || raw === "failed" ? raw : null;
}

type ErrorObject = {
  last_payment_error?: { code?: string | null; decline_code?: string | null } | null;
  last_finalization_error?: { code?: string | null } | null;
};

/** Stripe decline or return code, lower-case [a-z0-9_] only. Never message text. */
export function redactedErrorCode(object: unknown): string | null {
  const obj = (object && typeof object === "object" ? object : {}) as ErrorObject;
  const raw = obj.last_payment_error?.decline_code || obj.last_payment_error?.code || obj.last_finalization_error?.code || "";
  const code = String(raw).trim().toLowerCase();
  return /^[a-z0-9_]{1,60}$/.test(code) ? code : null;
}

export type BillPaymentSnapshot = {
  status: string;
  paymentState: BillPaymentState | null;
};

export type PaymentStatePlan =
  | { kind: "skip"; reason: "no_bill" | "closed" | "unknown_type" | "same_state" }
  | {
      kind: "update";
      paymentState: BillPaymentState | null;
      /** Which timestamp column to stamp with now(). */
      stamp: "processing_at" | "failed_at" | "overdue_at" | null;
      lastErrorCode: string | null;
      /** Parent notice to send, if any. */
      notify: BillPaymentState | null;
    };

/**
 * Decide the bill change for one Stripe event. Only a sent bill moves.
 * A paid, refunded, void or disputed bill is never downgraded.
 */
export function planPaymentStateEvent(type: string, object: unknown, bill: BillPaymentSnapshot | null): PaymentStatePlan {
  if (!bill) return { kind: "skip", reason: "no_bill" };
  if (bill.status !== "sent") return { kind: "skip", reason: "closed" };
  switch (type) {
    case "payment_intent.processing":
      if (bill.paymentState === "processing") return { kind: "skip", reason: "same_state" };
      return { kind: "update", paymentState: "processing", stamp: "processing_at", lastErrorCode: null, notify: "processing" };
    case "payment_intent.payment_failed":
      return {
        kind: "update",
        paymentState: "failed",
        stamp: "failed_at",
        lastErrorCode: redactedErrorCode(object) ?? "unknown",
        notify: "failed",
      };
    case "payment_intent.requires_action":
      if (bill.paymentState === "requires_action") return { kind: "skip", reason: "same_state" };
      return { kind: "update", paymentState: "requires_action", stamp: null, lastErrorCode: null, notify: "requires_action" };
    case "invoice.overdue":
      // Past due: keep the payment state, stamp overdue_at. Reminders use the existing stages.
      return { kind: "update", paymentState: bill.paymentState, stamp: "overdue_at", lastErrorCode: null, notify: null };
    default:
      return { kind: "skip", reason: "unknown_type" };
  }
}

/**
 * Reducer over a sequence of events, for tests and for reasoning:
 * paid always wins and clears payment_state.
 */
export function reduceBillPayment(
  bill: BillPaymentSnapshot & { lastErrorCode?: string | null },
  type: string,
  object: unknown = {},
): BillPaymentSnapshot & { lastErrorCode: string | null } {
  if (type === "payment_intent.succeeded" || type === "invoice.paid" || type === "checkout.session.completed") {
    if (bill.status === "sent" || bill.status === "draft") return { status: "paid", paymentState: null, lastErrorCode: null };
    return { ...bill, lastErrorCode: bill.lastErrorCode ?? null };
  }
  const plan = planPaymentStateEvent(type, object, bill);
  if (plan.kind === "skip") return { ...bill, lastErrorCode: bill.lastErrorCode ?? null };
  return {
    status: bill.status,
    paymentState: plan.paymentState,
    lastErrorCode: plan.paymentState === "failed" ? plan.lastErrorCode : null,
  };
}

/** Run fn once per event id with a database claim; release the claim when fn throws. */
export async function runClaimedEvent<T>(deps: {
  claim: () => Promise<boolean>;
  release: () => Promise<void>;
  run: () => Promise<T>;
}): Promise<{ duplicate: true } | { duplicate: false; result: T }> {
  if (!(await deps.claim())) return { duplicate: true };
  try {
    return { duplicate: false, result: await deps.run() };
  } catch (err) {
    await deps.release().catch(() => undefined);
    throw err;
  }
}

/* ---------------------------------- Mandates --------------------------------- */

export type MandateStatus = "active" | "inactive" | "pending";

export type StripeMandateObject = {
  id?: string;
  object?: string;
  status?: string | null;
  livemode?: boolean;
  payment_method?: string | { id?: string } | null;
  customer_acceptance?: { accepted_at?: number | null; type?: string | null } | null;
  payment_method_details?: {
    type?: string | null;
    acss_debit?: {
      url?: string | null;
      payment_schedule?: string | null;
      transaction_type?: string | null;
      interval_description?: string | null;
    } | null;
  } | null;
};

export type MandateRow = {
  mandateId: string;
  paymentMethodId: string;
  status: MandateStatus;
  type: string;
  livemode: boolean;
};

export function shapeMandateRow(object: unknown): MandateRow | null {
  const m = (object && typeof object === "object" ? object : {}) as StripeMandateObject;
  const mandateId = String(m.id || "").trim();
  if (!mandateId.startsWith("mandate_")) return null;
  const pm = typeof m.payment_method === "string" ? m.payment_method : m.payment_method?.id || "";
  if (!pm.startsWith("pm_")) return null;
  const status: MandateStatus = m.status === "active" || m.status === "inactive" ? m.status : "pending";
  const type = String(m.payment_method_details?.type || "acss_debit").trim() || "acss_debit";
  return { mandateId, paymentMethodId: pm, status, type, livemode: m.livemode === true };
}

export type MandatePlan = {
  row: MandateRow;
  /** Turn automatic pay off for this parent and tell them. */
  clearAutopay: boolean;
};

/** An inactive mandate on the parent's default (autopay) method ends autopay. */
export function planMandateEvent(object: unknown, ctx: { defaultPaymentMethodId: string | null }): MandatePlan | null {
  const row = shapeMandateRow(object);
  if (!row) return null;
  const clearAutopay = row.status === "inactive" && Boolean(ctx.defaultPaymentMethodId) && ctx.defaultPaymentMethodId === row.paymentMethodId;
  return { row, clearAutopay };
}

/* ------------------------------ Parent messages ------------------------------ */

type Locale = "en" | "fr";

const FAILURE_REASONS: Record<string, { en: string; fr: string }> = {
  insufficient_funds: { en: "not enough funds", fr: "fonds insuffisants" },
  card_declined: { en: "the card was declined", fr: "la carte a été refusée" },
  generic_decline: { en: "the card was declined", fr: "la carte a été refusée" },
  expired_card: { en: "the card has expired", fr: "la carte est expirée" },
  incorrect_cvc: { en: "the security code was wrong", fr: "le code de sécurité était erroné" },
  authentication_required: { en: "your bank needs you to confirm", fr: "votre banque demande une confirmation" },
  account_closed: { en: "the bank account is closed", fr: "le compte bancaire est fermé" },
  no_account: { en: "the bank account wasn't found", fr: "le compte bancaire est introuvable" },
  debit_not_authorized: { en: "the bank debit (PAD) wasn't authorized", fr: "le débit préautorisé (DPA) n’a pas été autorisé" },
  payment_method_microdeposit_verification_attempts_exceeded: {
    en: "the bank account couldn't be verified",
    fr: "le compte bancaire n’a pas pu être vérifié",
  },
};

/** A plain reason for the parent, or null when the code has no friendly words. */
export function failureReasonText(code: string | null | undefined, locale: Locale = "en"): string | null {
  const row = code ? FAILURE_REASONS[code] : undefined;
  return row ? row[locale] : null;
}

/** Text for the in-app message, push and email. Canadian wording, no US terms. */
export function paymentStateMessage(
  state: BillPaymentState,
  input: { daycareName: string; amountLabel: string; payUrl: string; walletUrl: string; errorCode?: string | null; locale?: Locale },
): { title: string; body: string } {
  const fr = input.locale === "fr";
  if (state === "processing") {
    return fr
      ? {
          title: "Paiement en traitement",
          body: `Votre paiement de ${input.amountLabel} à ${input.daycareName} est en traitement. Les débits préautorisés (DPA) prennent de 3 à 5 jours ouvrables.`,
        }
      : {
          title: "Payment processing",
          body: `Your ${input.amountLabel} payment to ${input.daycareName} is processing. Bank debits (PAD) take 3 to 5 business days.`,
        };
  }
  if (state === "failed") {
    const reason = failureReasonText(input.errorCode, fr ? "fr" : "en");
    return fr
      ? {
          title: "Votre paiement n’a pas été accepté",
          body: `Votre paiement de ${input.amountLabel} à ${input.daycareName} n’a pas été accepté${reason ? ` (${reason})` : ""}. Payez de nouveau : ${input.payUrl} ou mettez à jour votre carte : ${input.walletUrl}`,
        }
      : {
          title: "Your payment didn't go through",
          body: `Your ${input.amountLabel} payment to ${input.daycareName} didn't go through${reason ? ` (${reason})` : ""}. Pay again: ${input.payUrl} or update your card: ${input.walletUrl}`,
        };
  }
  return fr
    ? {
        title: "Confirmez votre paiement",
        body: `Confirmez votre paiement de ${input.amountLabel} à ${input.daycareName} auprès de votre banque : ${input.payUrl}`,
      }
    : {
        title: "Confirm your payment",
        body: `Confirm your ${input.amountLabel} payment to ${input.daycareName} with your bank: ${input.payUrl}`,
      };
}

export function mandateEndedMessage(locale: Locale = "en"): { title: string; body: string } {
  return locale === "fr"
    ? {
        title: "Votre entente de débit préautorisé (DPA) a pris fin",
        body: "Votre entente de débit préautorisé (DPA) a pris fin. Choisissez un autre mode de paiement.",
      }
    : {
        title: "Your bank debit (PAD) agreement ended",
        body: "Your bank debit (PAD) agreement ended. Choose another way to pay.",
      };
}
