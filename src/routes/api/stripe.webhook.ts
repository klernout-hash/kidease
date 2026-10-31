import { createFileRoute } from "@tanstack/react-router";
import { claimStripeEventOnce, gateStripeWebhook, releaseStripeEventClaim } from "@/lib/server/stripe-signature";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { applyStripeBillEvent } from "@/lib/server/billing";
import { applyConnectSideEffect, queueMonthlyFeeTax } from "@/lib/server/connect-payments";
import { applyStripeDisputeEvent, applyStripeSubscriptionEvent } from "@/lib/server/stripe-lifecycle";
import { selectStripeWebhookSecrets } from "@/lib/connect-payments";
import { applyParentStripeInvoice } from "@/lib/server/stripe-parent-invoices";

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

const PARENT_INVOICE_TYPES = new Set(["invoice.finalized", "invoice.paid", "invoice.payment_failed"]);

/**
 * Stripe webhook sink. Missing secret → 401. Missing or bad stripe-signature → 400.
 * Uses the same HMAC scheme as stripe.webhooks.constructEvent.
 * livemode false verifies with STRIPE_WEBHOOK_SECRET_TEST when that Preview
 * secret is set, and falls back to STRIPE_WEBHOOK_SECRET otherwise.
 * Same event id is a no-op.
 * Does not turn SUBSCRIPTIONS_ENABLED on, and does not enable Apple or Google
 * in-app purchases. Existing subscription events stay on their current path.
 */
async function run(request: Request) {
  const raw = await request.text();
  const secrets = selectStripeWebhookSecrets(raw);
  const sig = request.headers.get("stripe-signature") || "";
  const ip = requestIp(request);

  const gated = gateStripeWebhook(raw, sig, secrets);
  if (!gated.ok) {
    await logSecurityEvent({
      kind: "webhook_reject",
      detail: gated.status === 401 ? "stripe secret missing" : "stripe-signature rejected",
      ip,
    });
    return new Response(gated.status === 401 ? "Unauthorized" : "Bad Request", { status: gated.status });
  }
  const event = gated.event;
  if (!claimStripeEventOnce(event.id)) {
    return Response.json({ ok: true, duplicate: true, id: event.id ?? null });
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
        releaseStripeEventClaim(event.id);
        return Response.json({ ok: false, error: "bill apply failed" }, { status: 500 });
      }
      if (bill?.status === "paid" && bill.billId) {
        try {
          await queueMonthlyFeeTax(bill.billId);
        } catch (err) {
          console.error("[kidease-connect] fee tax draft skipped", err);
        }
        if (type === "invoice.paid") {
          const { captureServerProductEvent } = await import("@/lib/server/product-events");
          void captureServerProductEvent("invoice_paid", { result: "paid", source: "centre_bill" });
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
      releaseStripeEventClaim(event.id);
      return Response.json({ ok: false, error: "dispute apply failed" }, { status: 500 });
    }
  }

  if (SUB_TYPES.has(type)) {
    try {
      const sub = await applyStripeSubscriptionEvent({ type, object });
      userId = sub.userId;
    } catch (err) {
      console.error("[kidease-sub] webhook apply failed", err);
      releaseStripeEventClaim(event.id);
      return Response.json({ ok: false, error: "subscription apply failed" }, { status: 500 });
    }
  }

  let invoiceId: string | null = null;
  let parentUserId: string | null = null;
  let unlinked: string | null = null;
  if (PARENT_INVOICE_TYPES.has(type)) {
    try {
      const livemode = (event as { livemode?: boolean }).livemode === true;
      const invoice = await applyParentStripeInvoice({
        eventId: event.id,
        type,
        object,
        livemode,
      });
      invoiceId = invoice.invoiceId;
      parentUserId = invoice.parentUserId;
      unlinked = invoice.unlinked;
      if (!userId && parentUserId) userId = parentUserId;
    } catch (err) {
      console.error("[kidease-invoice] webhook apply failed", err);
      releaseStripeEventClaim(event.id);
      return Response.json({ ok: false, error: "invoice apply failed" }, { status: 500 });
    }
  }

  if (
    BILL_TYPES.has(type) ||
    SUB_TYPES.has(type) ||
    PARENT_INVOICE_TYPES.has(type) ||
    type === "charge.dispute.created"
  ) {
    return Response.json({
      ok: true,
      handled: type,
      id: event.data?.object?.id ?? event.id ?? null,
      billId: bill?.billId ?? null,
      billStatus: bill?.status ?? null,
      invoiceId,
      parentUserId,
      unlinked,
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
