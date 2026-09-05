import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { stripeChargesLive } from "@/lib/stripe-live";
import { catalogStatus, envPriceId, plusPriceKey } from "@/lib/server/stripe-catalog";
import {
  appOrigin,
  createBillingPortalSession,
  createCatalogCheckoutSession,
} from "@/lib/server/stripe-checkout";
import { isPlusInterval, isPlusPlanId, type PlusInterval, type PlusPlanId } from "@/lib/parent-plus";

export type ParentPlusState = {
  plan: PlusPlanId;
  interval: PlusInterval;
  status: string | null;
  stripeLive: boolean;
  checkoutLive: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  selectedAt: string | null;
  prices: Record<string, boolean>;
};

async function userEmail(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.email ?? null;
}

async function readPlus(userId: string): Promise<ParentPlusState> {
  const sql = await getSql();
  const rows = await sql<{
    plus_plan: string | null;
    plus_interval: string | null;
    plus_status: string | null;
    plus_subscription_id: string | null;
    plus_selected_at: string | null;
    stripe_customer_id: string | null;
  }>`
    select plus_plan, plus_interval, plus_status, plus_subscription_id, plus_selected_at, stripe_customer_id
    from profiles
    where user_id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  const stripeLive = stripeChargesLive();
  const prices = catalogStatus();
  const interval = isPlusInterval(row?.plus_interval) ? row.plus_interval : "month";
  return {
    plan: isPlusPlanId(row?.plus_plan) ? row.plus_plan : "free",
    interval,
    status: row?.plus_status ?? null,
    stripeLive,
    checkoutLive: stripeLive && Boolean(envPriceId(plusPriceKey(interval))),
    customerId: row?.stripe_customer_id ?? null,
    subscriptionId: row?.plus_subscription_id ?? null,
    selectedAt: row?.plus_selected_at ? String(row.plus_selected_at) : null,
    prices,
  };
}

export const getParentPlus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => readPlus(context.userId));

export const startParentPlusCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { interval: PlusInterval }) => {
    if (!isPlusInterval(input.interval)) throw new Error("Choose monthly or yearly");
    return { interval: input.interval };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, plus_plan, plus_interval, plus_selected_at)
      values (${context.userId}, ${"plus"}, ${data.interval}, now())
      on conflict (user_id) do update set
        plus_interval = excluded.plus_interval,
        plus_selected_at = now()
    `.catch(() => undefined);
    if (!stripeChargesLive()) {
      throw new Error("Plus checkout stays off until Stripe live keys are on. This pick is saved on the internal ledger (not charged).");
    }
    const priceId = envPriceId(plusPriceKey(data.interval));
    if (!priceId) throw new Error("Parent Plus price ID is not set. Add STRIPE_PRICE_PLUS_MONTHLY or STRIPE_PRICE_PLUS_YEARLY on Vercel.");
    const state = await readPlus(context.userId);
    const origin = appOrigin();
    const session = await createCatalogCheckoutSession({
      mode: "subscription",
      priceId,
      successUrl: `${origin}/parent?tab=payments&plus=success`,
      cancelUrl: `${origin}/parent?tab=payments&plus=cancel`,
      customerId: state.customerId,
      customerEmail: state.customerId ? null : await userEmail(context.userId),
      clientReferenceId: context.userId,
      metadata: {
        kidease: "parent_plus",
        user_id: context.userId,
        plan: "plus",
        interval: data.interval,
      },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link");
    return { url: session.url };
  });

export const startParentPlusPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const state = await readPlus(context.userId);
    if (!state.customerId) throw new Error("No Stripe customer on this profile yet. Start Plus checkout first.");
    if (!stripeChargesLive()) throw new Error("Billing portal stays off until Stripe live keys are on.");
    return createBillingPortalSession({
      customerId: state.customerId,
      returnUrl: `${appOrigin()}/parent?tab=payments`,
    });
  });
