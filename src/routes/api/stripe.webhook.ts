import { createFileRoute } from "@tanstack/react-router";
import { constructStripeEvent, StripeSignatureError } from "@/lib/server/stripe-signature";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { applyStripeBillEvent } from "@/lib/server/billing";
import { applyConnectSideEffect, queueMonthlyFeeTax } from "@/lib/server/connect-payments";
import { applyStripeDisputeEvent, applyStripeSubscriptionEvent } from "@/lib/server/stripe-lifecycle";
import { webhookSecrets } from "@/lib/connect-payments";

const BILL_TYPES = new Set([
  "payment_intent.succeeded",
  "checkout.session.completed",
  "charge.refunded",
  "payout.paid",
  "account.updated",
]);

const SUB_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

/**
 * Stripe webhook sink. Fail closed: missing secret or bad signature → 401.
 * Uses the same HMAC scheme as stripe.webhooks.constructEvent.
 */
async function run(request: Request) {
  const raw = await request.text();
  const secrets = webhookSecrets();
  const sig = request.headers.get("stripe-signature") || "";
  const ip = requestIp(request);

  if (!secrets.length) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "stripe secret missing", ip });
    return new Response("Unauthorized", { status: 401 });
  }

  let event;
  let verifyError: unknown;
  for (const secret of secrets) {
    try {
      event = constructStripeEvent(raw, sig, secret);
      verifyError = undefined;
      break;
    } catch (err) {
      verifyError = err;
    }
  }
  if (!event) {
    const reason = verifyError instanceof StripeSignatureError ? verifyError.message : "stripe verify failed";
    await logSecurityEvent({ kind: "webhook_reject", detail: reason, ip });
    return new Response("Unauthorized", { status: 401 });
  }

  const type = event.type ?? "";
  await logSecurityEvent({
    kind: "webhook_accept",
    detail: `stripe ${type || "ping"}`,
    ip,
  });

  const object = event.data?.object ?? null;
  let bill: { billId: string | null; status?: string } | undefined;
  let userId: string | null = null;

  const meta = object?.metadata || {};
  const centreBill = meta.kidease === "bill" || Boolean(meta.bill_id);

  if (BILL_TYPES.has(type) || (type === "invoice.paid" && centreBill)) {
    if (
      type === "payment_intent.succeeded" ||
      type === "checkout.session.completed" ||
      type === "charge.refunded" ||
      (type === "invoice.paid" && centreBill)
    ) {
      try {
        bill = await applyStripeBillEvent({ type, object });
      } catch (err) {
        console.error("[kidease-bill] webhook apply failed", err);
        return Response.json({ ok: false, error: "bill apply failed" }, { status: 500 });
      }
      if (bill?.status === "paid" && bill.billId) {
        try {
          await queueMonthlyFeeTax(bill.billId);
        } catch (err) {
          console.error("[kidease-connect] fee tax draft skipped", err);
        }
      }
    }
    if (type === "account.updated" || type === "payout.paid") {
      try {
        await applyConnectSideEffect(type, object as Record<string, unknown>);
      } catch (err) {
        console.error("[kidease-connect] webhook side effect skipped", err);
      }
    }
  }

  if (type === "invoice.paid" && meta.kidease === "fee_tax") {
    try {
      await applyConnectSideEffect(type, object as Record<string, unknown>);
    } catch (err) {
      console.error("[kidease-connect] fee tax status skipped", err);
    }
  }

  if (type === "charge.dispute.created") {
    try {
      bill = await applyStripeDisputeEvent({ type, object });
    } catch (err) {
      console.error("[kidease-bill] dispute apply failed", err);
      return Response.json({ ok: false, error: "dispute apply failed" }, { status: 500 });
    }
  }

  if (SUB_TYPES.has(type)) {
    try {
      const sub = await applyStripeSubscriptionEvent({ type, object });
      userId = sub.userId;
    } catch (err) {
      console.error("[kidease-sub] webhook apply failed", err);
      return Response.json({ ok: false, error: "subscription apply failed" }, { status: 500 });
    }
  }

  if (
    BILL_TYPES.has(type) ||
    SUB_TYPES.has(type) ||
    type === "charge.dispute.created"
  ) {
    return Response.json({
      ok: true,
      handled: type,
      id: event.data?.object?.id ?? event.id ?? null,
      billId: bill?.billId ?? null,
      billStatus: bill?.status ?? null,
      userId,
    });
  }

  return Response.json({ ok: true, ignored: type || "ping" });
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
