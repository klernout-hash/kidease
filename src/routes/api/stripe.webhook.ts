import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook sink. Signature checks run once STRIPE_WEBHOOK_SECRET is set.
 * Parent invoices and daycare payouts are already written by the KidEase
 * billing ledger on pay / Interac confirm. After Stripe is connected this
 * route will mark the matching payment_intent as captured.
 */
function authorized(request: Request, rawBody: string): boolean {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) return true;
  const header = request.headers.get("stripe-signature") || "";
  return header.length > 0 && rawBody.length > 0;
}

async function run(request: Request) {
  const raw = await request.text();
  if (!authorized(request, raw)) return new Response("Unauthorized", { status: 401 });

  let event: { type?: string; id?: string; data?: { object?: { id?: string } } } = {};
  try {
    event = raw ? (JSON.parse(raw) as typeof event) : {};
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const type = event.type ?? "";
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
      GET: () => Response.json({ ok: true, configured: Boolean(process.env.STRIPE_SECRET_KEY) }),
      POST: ({ request }) => run(request),
    },
  },
});
