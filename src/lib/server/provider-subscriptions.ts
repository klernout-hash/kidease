import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { resolveSessionDesks } from "@/lib/server/roles";
import { canSeeProviderSubscriptions, providerSubscriptionsEnabled } from "@/lib/features";
import { stripeChargesLive } from "@/lib/stripe-live";
import {
  isProviderInterval,
  isProviderPlanId,
  parseProviderAddons,
  PROVIDER_CHECKOUT_LIVE,
  serializeProviderAddons,
  type ProviderAddonId,
  type ProviderInterval,
  type ProviderPlanId,
} from "@/lib/provider-plans";
import {
  addonCheckoutMode,
  addonPriceKey,
  catalogStatus,
  envPaymentLink,
  envPriceId,
  providerPriceKey,
} from "@/lib/server/stripe-catalog";
import {
  appOrigin,
  createBillingPortalSession,
  createCatalogCheckoutSession,
} from "@/lib/server/stripe-checkout";

export type ProviderSubscriptionState = {
  plan: ProviderPlanId;
  interval: ProviderInterval;
  addons: ProviderAddonId[];
  siteCount: number;
  ghost: boolean;
  checkoutLive: boolean;
  stripeLive: boolean;
  selectedAt: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  prices: Record<string, boolean>;
  paymentLinks: Partial<Record<ProviderAddonId, string>>;
};

async function requireSubscriptionAccess(userId: string) {
  const session = await resolveSessionDesks(userId);
  if (!canSeeProviderSubscriptions(session.role)) {
    throw new Error("Not authorized");
  }
  return session;
}

async function siteCountFor(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from provider_daycares where user_id = ${userId}
  `.catch(() => [{ n: 0 }]);
  return rows[0]?.n ?? 0;
}

async function userEmail(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId} limit 1
  `.catch(() => []);
  return rows[0]?.email ?? null;
}

async function readSelection(userId: string): Promise<ProviderSubscriptionState> {
  const sql = await getSql();
  const rows = await sql<{
    selected_plan: string | null;
    selected_interval: string | null;
    selected_addons: string | null;
    selected_plan_at: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_subscription_status: string | null;
  }>`
    select selected_plan, selected_interval, selected_addons, selected_plan_at,
           stripe_customer_id, stripe_subscription_id, stripe_subscription_status
    from profiles
    where user_id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  const stripeLive = stripeChargesLive();
  const prices = catalogStatus();
  const paymentLinks: Partial<Record<ProviderAddonId, string>> = {};
  for (const addon of ["featured_city", "claim_boost", "job_post"] as const) {
    const link = envPaymentLink(addon);
    if (link) paymentLinks[addon] = link;
  }
  return {
    plan: isProviderPlanId(row?.selected_plan) ? row.selected_plan : "free",
    interval: isProviderInterval(row?.selected_interval) ? row.selected_interval : "month",
    addons: parseProviderAddons(row?.selected_addons),
    siteCount: await siteCountFor(userId),
    ghost: !providerSubscriptionsEnabled(),
    checkoutLive:
      stripeLive && PROVIDER_CHECKOUT_LIVE && (prices.pro_monthly || prices.pro_yearly || prices.network_monthly),
    stripeLive,
    selectedAt: row?.selected_plan_at ? String(row.selected_plan_at) : null,
    customerId: row?.stripe_customer_id ?? null,
    subscriptionId: row?.stripe_subscription_id ?? null,
    subscriptionStatus: row?.stripe_subscription_status ?? null,
    prices,
    paymentLinks,
  };
}

async function persistSelection(
  userId: string,
  data: { plan: ProviderPlanId; interval: ProviderInterval; addons: ProviderAddonId[] },
) {
  const sql = await getSql();
  await sql`
    insert into profiles (user_id, selected_plan, selected_interval, selected_addons, selected_plan_at)
    values (${userId}, ${data.plan}, ${data.interval}, ${serializeProviderAddons(data.addons)}, now())
    on conflict (user_id) do update set
      selected_plan = excluded.selected_plan,
      selected_interval = excluded.selected_interval,
      selected_addons = excluded.selected_addons,
      selected_plan_at = now()
  `;
}

export const getProviderSubscription = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireSubscriptionAccess(context.userId);
    return readSelection(context.userId);
  });

export const saveProviderSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { plan: ProviderPlanId; interval: ProviderInterval; addons: ProviderAddonId[] }) => {
    if (!isProviderPlanId(input.plan)) throw new Error("Choose a centre plan");
    if (!isProviderInterval(input.interval)) throw new Error("Choose monthly or yearly");
    return {
      plan: input.plan,
      interval: input.interval,
      addons: parseProviderAddons(serializeProviderAddons(input.addons)),
    };
  })
  .handler(async ({ context, data }) => {
    await requireSubscriptionAccess(context.userId);
    await persistSelection(context.userId, data);
    return readSelection(context.userId);
  });

export const startProviderCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { plan: ProviderPlanId; interval: ProviderInterval; addons: ProviderAddonId[] }) => {
    if (!isProviderPlanId(input.plan)) throw new Error("Choose a centre plan");
    if (!isProviderInterval(input.interval)) throw new Error("Choose monthly or yearly");
    return {
      plan: input.plan,
      interval: input.interval,
      addons: parseProviderAddons(serializeProviderAddons(input.addons)),
    };
  })
  .handler(async ({ context, data }) => {
    await requireSubscriptionAccess(context.userId);
    await persistSelection(context.userId, data);
    if (data.plan === "free") {
      return { url: null as string | null, saved: true as const };
    }
    if (!stripeChargesLive()) {
      throw new Error("Centre plan checkout stays off until Stripe live keys are on. This pick is saved on the internal ledger (not charged).");
    }
    const priceKey = providerPriceKey(data.plan, data.interval);
    const priceId = priceKey ? envPriceId(priceKey) : null;
    if (!priceId) {
      throw new Error("This plan’s Stripe price ID is not set. Add it on Vercel, then try again.");
    }
    const state = await readSelection(context.userId);
    if (data.plan === "network" && state.siteCount < 3) {
      throw new Error("Network is priced for 3 or more sites.");
    }
    const origin = appOrigin();
    const session = await createCatalogCheckoutSession({
      mode: "subscription",
      priceId,
      quantity: data.plan === "network" ? Math.max(3, state.siteCount) : 1,
      successUrl: `${origin}/provider/subscription?checkout=success`,
      cancelUrl: `${origin}/provider/subscription?checkout=cancel`,
      customerId: state.customerId,
      customerEmail: state.customerId ? null : await userEmail(context.userId),
      clientReferenceId: context.userId,
      metadata: {
        kidease: "provider_sub",
        user_id: context.userId,
        plan: data.plan,
        interval: data.interval,
      },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link");
    return { url: session.url, saved: true as const };
  });

export const startProviderAddonCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { addon: ProviderAddonId }) => {
    const addon = input.addon;
    if (addon !== "featured_city" && addon !== "claim_boost" && addon !== "job_post") {
      throw new Error("Choose an add-on");
    }
    return { addon };
  })
  .handler(async ({ context, data }) => {
    await requireSubscriptionAccess(context.userId);
    const state = await readSelection(context.userId);
    const nextAddons = state.addons.includes(data.addon) ? state.addons : [...state.addons, data.addon];
    await persistSelection(context.userId, { plan: state.plan, interval: state.interval, addons: nextAddons });
    if (!stripeChargesLive()) {
      throw new Error("Add-on checkout stays off until Stripe live keys are on. This pick is saved (not charged).");
    }
    const priceId = envPriceId(addonPriceKey(data.addon));
    const paymentLink = envPaymentLink(data.addon);
    if (!priceId && paymentLink) return { url: paymentLink };
    if (!priceId) throw new Error("This add-on’s Stripe price ID is not set. Add it on Vercel, then try again.");
    const origin = appOrigin();
    const session = await createCatalogCheckoutSession({
      mode: addonCheckoutMode(data.addon),
      priceId,
      successUrl: `${origin}/provider/subscription?addon=success`,
      cancelUrl: `${origin}/provider/subscription?addon=cancel`,
      customerId: state.customerId,
      customerEmail: state.customerId ? null : await userEmail(context.userId),
      clientReferenceId: context.userId,
      metadata: {
        kidease: "addon",
        user_id: context.userId,
        addon: data.addon,
      },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link");
    return { url: session.url };
  });

export const startProviderBillingPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireSubscriptionAccess(context.userId);
    const state = await readSelection(context.userId);
    if (!state.customerId) throw new Error("No Stripe customer on this profile yet. Start checkout first.");
    if (!stripeChargesLive()) throw new Error("Billing portal stays off until Stripe live keys are on.");
    const origin = appOrigin();
    return createBillingPortalSession({
      customerId: state.customerId,
      returnUrl: `${origin}/provider/subscription`,
    });
  });
