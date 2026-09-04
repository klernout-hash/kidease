import { createFileRoute } from "@tanstack/react-router";
import { constructStripeEvent, StripeSignatureError } from "@/lib/server/stripe-signature";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

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

  if (
    type === "payment_intent.succeeded" ||
    type === "checkout.session.completed" ||
    type === "payout.paid" ||
    type === "account.updated"
  ) {
    return Response.json({ ok: true, handled: type, id: event.data?.object?.id ?? event.id ?? null });
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
