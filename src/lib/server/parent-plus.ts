import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { stripeChargesLive } from "@/lib/stripe-live";
import { e2eCheckoutMock, E2E_CHECKOUT_URL } from "@/lib/server/e2e-fixture.server";
import { catalogStatus, envPriceId, parentPriceKey } from "@/lib/server/stripe-catalog";
import {
  appOrigin,
  createBillingPortalSession,
  createCatalogCheckoutSession,
  updateSubscriptionCancelAtPeriodEnd,
} from "@/lib/server/stripe-checkout";
import {
  applyStripeSubscriptionEvent,
  profileCheckoutLocale,
  rememberStripeCustomer,
  type StripeLifecycleObject,
} from "@/lib/server/stripe-lifecycle";
import { normalizeCheckoutLocale } from "@/lib/stripe-wallets";
import { ALREADY_BILLED, checkoutBlockedByLiveSubscription } from "@/lib/subscription-lifecycle";
import { requireCatalogCheckout } from "@/lib/server/stripe-price-guard";
import { runUserCheckout } from "@/lib/server/stripe-checkout-log";
import { CHECKOUT_COULD_NOT_START, PORTAL_COULD_NOT_OPEN } from "@/lib/stripe-public-error";
import { isPlusInterval, isPlusPlanId, type PlusInterval, type PlusPlanId } from "@/lib/parent-plus";
import { decideParentPlusCheckout, PLUS_PRICE_MISSING } from "@/lib/access-control";
import { assertPayCheckoutAllowed } from "@/lib/features";
import { resolveSessionDesks } from "@/lib/server/roles";
import { canBuyParentUpgrade, PARENT_UPGRADE_DENIED } from "@/lib/upgrade-role";

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
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
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
    plus_cancel_at_period_end: boolean | null;
    plus_current_period_end: string | Date | null;
  }>`
    select plus_plan, plus_interval, plus_status, plus_subscription_id, plus_selected_at,
           plus_cancel_at_period_end, plus_current_period_end,
           stripe_customer_id, catalog_checkout_session_id
    from profiles
    where user_id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  const mockCheckout = e2eCheckoutMock();
  const stripeLive = mockCheckout || stripeChargesLive();
  const listed = catalogStatus();
  const prices = mockCheckout
    ? (Object.fromEntries(Object.keys(listed).map((key) => [key, true])) as typeof listed)
    : listed;
  const interval = isPlusInterval(row?.plus_interval) ? row.plus_interval : "month";
  return {
    plan: isPlusPlanId(row?.plus_plan) ? row.plus_plan : "free",
    interval,
    status: row?.plus_status ?? null,
    stripeLive,
    checkoutLive: stripeLive && Boolean(envPriceId(parentPriceKey("plus", interval))),
    customerId: row?.stripe_customer_id ?? null,
    subscriptionId: row?.plus_subscription_id ?? null,
    selectedAt: row?.plus_selected_at ? String(row.plus_selected_at) : null,
    catalogCheckoutSessionId: row?.catalog_checkout_session_id ?? null,
    cancelAtPeriodEnd: Boolean(row?.plus_cancel_at_period_end),
    periodEnd: periodIso(row?.plus_current_period_end),
    prices,
  };
}

function periodIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parentPortalConfiguration(): string | null {
  const id = String(process.env.STRIPE_BILLING_PORTAL_PARENT || "").trim();
  return id.startsWith("bpc_") ? id : null;
}

async function assertParentBuyer(userId: string) {
  const desks = await resolveSessionDesks(userId);
  if (!canBuyParentUpgrade({ role: desks.role, ownsCentre: desks.ownsCentre, linkedToCentre: desks.centreLinked })) {
    throw new Error(PARENT_UPGRADE_DENIED);
  }
  return desks;
}

export const getParentPlus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertParentBuyer(context.userId);
    return readPlus(context.userId);
  });

export const startParentPlusCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { interval: PlusInterval; plan?: "plus" | "alerts"; locale?: string | null }) => {
    if (!isPlusInterval(input.interval)) throw new Error("Choose monthly or yearly");
    const plan = input.plan === "alerts" ? "alerts" : "plus";
    return { interval: input.interval, plan, locale: normalizeCheckoutLocale(input.locale) };
  })
  .handler(async ({ context, data }) => {
    const desks = await assertParentBuyer(context.userId);
    assertPayCheckoutAllowed(desks.role);
    if (e2eCheckoutMock()) return { url: E2E_CHECKOUT_URL };
    const plan = data.plan === "alerts" ? "alerts" : "plus";
    if (plan === "alerts" && (!envPriceId("parent_alerts_monthly") || !envPriceId("parent_alerts_yearly"))) {
      throw new Error(PLUS_PRICE_MISSING);
    }
    const priceKey = parentPriceKey(plan, data.interval);
    const priceId = envPriceId(priceKey);
    const gate = decideParentPlusCheckout({ stripeLive: stripeChargesLive(), priceId });
    if (!gate.ok) throw new Error(gate.error);
    if (!priceId) throw new Error(PLUS_PRICE_MISSING);
    const state = await readPlus(context.userId);
    if (state.subscriptionId && checkoutBlockedByLiveSubscription(state.status)) {
      throw new Error(ALREADY_BILLED);
    }
    const origin = appOrigin();
    return runUserCheckout({
      surface: "parent_plus",
      userId: context.userId,
      fallback: CHECKOUT_COULD_NOT_START,
      fn: async () => {
        const checked = await requireCatalogCheckout(priceKey);
        const locale = data.locale ?? (await profileCheckoutLocale(context.userId));
        const session = await createCatalogCheckoutSession({
          mode: checked.mode,
          priceId: checked.priceId,
          successUrl: `${origin}/parent?tab=payments&plus=success&plan=${plan}&interval=${data.interval}&session={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/parent?tab=payments&plus=cancel`,
          customerId: state.customerId,
          customerEmail: state.customerId ? null : await userEmail(context.userId),
          userId: context.userId,
          clientReferenceId: context.userId,
          locale,
          metadata: {
            kidease: "parent_plus",
            role: "parent",
            buyer: desks.role === "admin" ? "admin" : "parent",
            user_id: context.userId,
            plan,
            interval: data.interval,
          },
        });
        await rememberStripeCustomer(context.userId, session.customer ?? null);
        if (!session.url) throw new Error("Stripe did not return a checkout link");
        return { url: session.url };
      },
    });
  });

export const startParentPlusPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertParentBuyer(context.userId);
    const state = await readPlus(context.userId);
    if (!state.customerId) throw new Error("No Stripe customer on this profile yet. Start Plus checkout first.");
    if (!state.subscriptionId) throw new Error("No Stripe subscription on this profile yet. Nothing was changed.");
    if (!stripeChargesLive()) throw new Error("Billing portal stays off until Stripe live keys are on.");
    return runUserCheckout({
      surface: "parent_plus_portal",
      userId: context.userId,
      fallback: PORTAL_COULD_NOT_OPEN,
      fn: () =>
        createBillingPortalSession({
          customerId: state.customerId!,
          subscriptionId: state.subscriptionId,
          configurationId: parentPortalConfiguration(),
          returnUrl: `${appOrigin()}/parent?tab=payments&billing=return`,
        }),
    });
  });

export const setParentPlusCancel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { cancel?: boolean }) => ({ cancel: input.cancel !== false }))
  .handler(async ({ context, data }) => {
    await assertParentBuyer(context.userId);
    const state = await readPlus(context.userId);
    if (!stripeChargesLive()) throw new Error("Billing stays off until Stripe live keys are on. Nothing was changed.");
    if (!state.subscriptionId) throw new Error("No Stripe subscription on this profile yet. Nothing was changed.");
    return runUserCheckout({
      surface: data.cancel ? "parent_plus_cancel" : "parent_plus_resume",
      userId: context.userId,
      fallback: "Could not update this subscription. Nothing else was changed.",
      fn: async () => {
        const updated = await updateSubscriptionCancelAtPeriodEnd(state.subscriptionId!, data.cancel);
        await applyStripeSubscriptionEvent({
          type: "customer.subscription.updated",
          object: updated as StripeLifecycleObject,
        });
        const next = await readPlus(context.userId);
        return { periodEnd: next.periodEnd, cancel: data.cancel };
      },
    });
  });
