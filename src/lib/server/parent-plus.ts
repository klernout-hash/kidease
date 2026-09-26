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
import { requireCatalogCheckout } from "@/lib/server/stripe-price-guard";
import { runUserCheckout } from "@/lib/server/stripe-checkout-log";
import { CHECKOUT_COULD_NOT_START, PORTAL_COULD_NOT_OPEN } from "@/lib/stripe-public-error";
import { isPlusInterval, isPlusPlanId, type PlusInterval, type PlusPlanId } from "@/lib/parent-plus";
import { decideParentPlusCheckout, PLUS_PRICE_MISSING } from "@/lib/access-control";
import { assertPayCheckoutAllowed } from "@/lib/features";
import { resolveSessionDesks } from "@/lib/server/roles";

export type ParentPlusState = {
  plan: PlusPlanId;
  interval: PlusInterval;
  status: string | null;
  stripeLive: boolean;
  checkoutLive: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  selectedAt: string | null;
  catalogCheckoutSessionId: string | null;
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
    catalog_checkout_session_id: string | null;
  }>`
    select plus_plan, plus_interval, plus_status, plus_subscription_id, plus_selected_at,
           stripe_customer_id, catalog_checkout_session_id
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
    catalogCheckoutSessionId: row?.catalog_checkout_session_id ?? null,
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
    const desks = await resolveSessionDesks(context.userId);
    assertPayCheckoutAllowed(desks.role);
    const priceKey = plusPriceKey(data.interval);
    const priceId = envPriceId(priceKey);
    const gate = decideParentPlusCheckout({ stripeLive: stripeChargesLive(), priceId });
    if (!gate.ok) throw new Error(gate.error);
    if (!priceId) throw new Error(PLUS_PRICE_MISSING);
    const state = await readPlus(context.userId);
    const origin = appOrigin();
    return runUserCheckout({
      surface: "parent_plus",
      userId: context.userId,
      fallback: CHECKOUT_COULD_NOT_START,
      fn: async () => {
        const checked = await requireCatalogCheckout(priceKey);
        const session = await createCatalogCheckoutSession({
          mode: checked.mode,
          priceId: checked.priceId,
          successUrl: `${origin}/parent?tab=payments&plus=success&session={CHECKOUT_SESSION_ID}`,
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
      },
    });
  });

export const startParentPlusPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const state = await readPlus(context.userId);
    if (!state.customerId) throw new Error("No Stripe customer on this profile yet. Start Plus checkout first.");
    if (!stripeChargesLive()) throw new Error("Billing portal stays off until Stripe live keys are on.");
    return runUserCheckout({
      surface: "parent_plus_portal",
      userId: context.userId,
      fallback: PORTAL_COULD_NOT_OPEN,
      fn: () =>
        createBillingPortalSession({
          customerId: state.customerId!,
          returnUrl: `${appOrigin()}/parent?tab=payments`,
        }),
    });
  });
