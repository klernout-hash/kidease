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

export type ProviderSubscriptionState = {
  plan: ProviderPlanId;
  interval: ProviderInterval;
  addons: ProviderAddonId[];
  siteCount: number;
  ghost: boolean;
  checkoutLive: boolean;
  stripeLive: boolean;
  selectedAt: string | null;
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

async function readSelection(userId: string): Promise<ProviderSubscriptionState> {
  const sql = await getSql();
  const rows = await sql<{
    selected_plan: string | null;
    selected_interval: string | null;
    selected_addons: string | null;
    selected_plan_at: string | null;
  }>`
    select selected_plan, selected_interval, selected_addons, selected_plan_at
    from profiles
    where user_id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  return {
    plan: isProviderPlanId(row?.selected_plan) ? row.selected_plan : "free",
    interval: isProviderInterval(row?.selected_interval) ? row.selected_interval : "month",
    addons: parseProviderAddons(row?.selected_addons),
    siteCount: await siteCountFor(userId),
    ghost: !providerSubscriptionsEnabled(),
    checkoutLive: PROVIDER_CHECKOUT_LIVE,
    stripeLive: stripeChargesLive(),
    selectedAt: row?.selected_plan_at ? String(row.selected_plan_at) : null,
  };
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
    const sql = await getSql();
    await sql`
      insert into profiles (user_id, selected_plan, selected_interval, selected_addons, selected_plan_at)
      values (${context.userId}, ${data.plan}, ${data.interval}, ${serializeProviderAddons(data.addons)}, now())
      on conflict (user_id) do update set
        selected_plan = excluded.selected_plan,
        selected_interval = excluded.selected_interval,
        selected_addons = excluded.selected_addons,
        selected_plan_at = now()
    `;
    return readSelection(context.userId);
  });
