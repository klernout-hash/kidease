/**
 * Stripe events KidEase records but does not act on with money.
 * Pure helpers: no database, no Stripe calls. Node tests import this file.
 *
 * Main endpoint: charge.dispute.closed, radar.early_fraud_warning.created,
 * invoice.upcoming, customer.subscription.trial_will_end,
 * setup_intent.setup_failed, payment_method.automatically_updated.
 * Connect endpoint (handled in connect-payments): payout.failed,
 * capability.updated, account.application.deauthorized.
 *
 * Nothing here sends email, SMS, or push. Stripe's own customer emails
 * (Billing settings) cover upcoming renewals and trial endings.
 */

export const STRIPE_NOTICE_TYPES = new Set([
  "charge.dispute.closed",
  "radar.early_fraud_warning.created",
  "invoice.upcoming",
  "customer.subscription.trial_will_end",
  "setup_intent.setup_failed",
  "payment_method.automatically_updated",
]);

export const CONNECT_NOTICE_TYPES = new Set([
  "payout.failed",
  "capability.updated",
  "account.application.deauthorized",
]);

export type StripeNotice = {
  type: string;
  objectId: string | null;
  /** Charge the notice is about (disputes and early fraud warnings). */
  chargeId: string | null;
  customerId: string | null;
  /** Dispute status (won / lost / warning_closed), or a short failure code. */
  status: string | null;
  /** One short audit line. No card numbers, emails, or amounts beyond cents. */
  detail: string;
};

type Obj = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function idOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return str((value as Obj).id);
  return "";
}

function safeCode(value: unknown): string {
  return str(value)
    .replace(/[^a-z0-9_.-]/gi, "")
    .slice(0, 60);
}

export function shapeStripeNotice(type: string, object: unknown): StripeNotice | null {
  if (!STRIPE_NOTICE_TYPES.has(type) && !CONNECT_NOTICE_TYPES.has(type)) return null;
  const obj = (object && typeof object === "object" ? object : {}) as Obj;
  const objectId = str(obj.id) || null;
  const customerId = idOf(obj.customer) || null;
  let chargeId: string | null = null;
  let status: string | null = null;
  if (type === "charge.dispute.closed") {
    chargeId = idOf(obj.charge) || null;
    status = safeCode(obj.status) || null;
  } else if (type === "radar.early_fraud_warning.created") {
    chargeId = idOf(obj.charge) || null;
    status = safeCode(obj.fraud_type) || null;
  } else if (type === "setup_intent.setup_failed") {
    const err = (
      obj.last_setup_error && typeof obj.last_setup_error === "object" ? obj.last_setup_error : {}
    ) as Obj;
    status = safeCode(err.decline_code) || safeCode(err.code) || null;
  } else if (type === "payout.failed") {
    status = safeCode(obj.failure_code) || null;
  } else if (type === "capability.updated") {
    status = safeCode(obj.status) || null;
  }
  const parts = [
    `stripe ${type}`,
    objectId,
    chargeId ? `charge ${chargeId}` : null,
    status ? `status ${status}` : null,
  ];
  return {
    type,
    objectId,
    chargeId,
    customerId,
    status,
    detail: parts.filter(Boolean).join(" · ").slice(0, 240),
  };
}

/** What a closed dispute does to the bill. Won goes back to paid; lost stays disputed. */
export function disputeClosedBillStatus(
  status: string | null | undefined,
): "paid" | "disputed" | null {
  const value = String(status || "").trim();
  if (value === "won" || value === "warning_closed") return "paid";
  if (value === "lost") return "disputed";
  return null;
}
