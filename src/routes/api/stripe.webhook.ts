import { createFileRoute } from "@tanstack/react-router";
import { constructStripeEvent, StripeSignatureError } from "@/lib/server/stripe-signature";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { applyStripeBillEvent } from "@/lib/server/billing";
import { applyStripeDisputeEvent, applyStripeSubscriptionEvent } from "@/lib/server/stripe-lifecycle";

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
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const sig = request.headers.get("stripe-signature") || "";
  const ip = requestIp(request);

  if (!secret) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "stripe secret missing", ip });
    return new Response("Unauthorized", { status: 401 });
  }

  let event;
  try {
    event = constructStripeEvent(raw, sig, secret);
  } catch (err) {
    const reason = err instanceof StripeSignatureError ? err.message : "stripe verify failed";
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

  if (BILL_TYPES.has(type)) {
    if (type === "payment_intent.succeeded" || type === "checkout.session.completed" || type === "charge.refunded") {
      try {
        bill = await applyStripeBillEvent({ type, object });
      } catch (err) {
        console.error("[kidease-bill] webhook apply failed", err);
        return Response.json({ ok: false, error: "bill apply failed" }, { status: 500 });
      }
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
