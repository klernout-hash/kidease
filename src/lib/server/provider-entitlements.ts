import { getSql, type Sql } from "@/lib/db";
import { stripeChargesLive } from "@/lib/stripe-live";
import { featuredPinForCentre } from "@/lib/centre-addons";
import { listingMatchesLocationLock, type LocationLock } from "@/lib/location-lock";
import { isProviderPlanId, parseProviderAddons, type ProviderPlanId } from "@/lib/provider-plans";
import {
  inquiryAtCap,
  inquiryCapCopy,
  resolveProviderEntitlements,
  type ProviderEntitlements,
} from "@/lib/provider-entitlements";

export type CentreOwnerPlanRow = {
  user_id: string;
  selected_plan: string | null;
  selected_addons: string | null;
  stripe_subscription_status: string | null;
  featured_city_status: string | null;
  featured_city_centre_id?: string | null;
};

export async function loadProfileEntitlements(
  sql: Sql,
  userId: string,
): Promise<ProviderEntitlements> {
  const rows = await sql<{
    selected_plan: string | null;
    selected_addons: string | null;
    stripe_subscription_status: string | null;
    featured_city_status: string | null;
  }>`
    select selected_plan, selected_addons, stripe_subscription_status, featured_city_status
    from profiles
    where user_id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  return resolveProviderEntitlements({
    plan: row?.selected_plan,
    status: row?.stripe_subscription_status,
    addons: row?.selected_addons,
    stripeLive: stripeChargesLive(),
    featuredCityStatus: row?.featured_city_status,
  });
}

export async function loadCentreOwnerRows(sql: Sql, daycareId: string): Promise<CentreOwnerPlanRow[]> {
  return sql<CentreOwnerPlanRow>`
    select p.user_id, pr.selected_plan, pr.selected_addons, pr.stripe_subscription_status,
           pr.featured_city_status
    from provider_daycares p
    left join profiles pr on pr.user_id = p.user_id
    where p.daycare_id = ${daycareId}
  `.catch(() => []);
}

/** Best entitlement among owners. Any paid owner unlocks Pro/Network extras for that listing. */
export function entitlementsFromOwners(rows: CentreOwnerPlanRow[]): ProviderEntitlements {
  const stripeLive = stripeChargesLive();
  if (!rows.length) {
    return resolveProviderEntitlements({ plan: "free", status: null, addons: "", stripeLive });
  }
  const resolved = rows.map((row) =>
    resolveProviderEntitlements({
      plan: row.selected_plan,
      status: row.stripe_subscription_status,
      addons: row.selected_addons,
      stripeLive,
      featuredCityStatus: row.featured_city_status,
    }),
  );
  const rank = (plan: ProviderPlanId) => (plan === "network" ? 2 : plan === "pro" ? 1 : 0);
  return resolved.reduce((best, next) => {
    const nextRank = rank(next.entitledPlan) + (next.featuredCity ? 0.1 : 0);
    const bestRank = rank(best.entitledPlan) + (best.featuredCity ? 0.1 : 0);
    return nextRank > bestRank ? next : best;
  });
}

export async function loadCentreEntitlements(sql: Sql, daycareId: string): Promise<ProviderEntitlements> {
  return entitlementsFromOwners(await loadCentreOwnerRows(sql, daycareId));
}

export async function countCentreInquiriesThisMonth(sql: Sql, daycareId: string): Promise<number> {
  const threads = await sql<{ n: number }>`
    select count(*)::int as n
    from conversations c
    where c.daycare_id = ${daycareId}
      and (
        select min(m.created_at) from messages m where m.conversation_id = c.id
      ) >= date_trunc('month', now())
  `.catch(() => [{ n: 0 }]);
  const tours = await sql<{ n: number }>`
    select count(*)::int as n
    from tour_requests t
    where t.daycare_id = ${daycareId}
      and t.created_at >= date_trunc('month', now())
      and (
        select min(m.created_at)
        from messages m
        where m.conversation_id = t.conversation_id
      ) < date_trunc('month', now())
  `.catch(() => [{ n: 0 }]);
  return (threads[0]?.n ?? 0) + (tours[0]?.n ?? 0);
}

export type InquiryAccept = { ok: true; used: number; entitlements: ProviderEntitlements } | {
  ok: false;
  used: number;
  entitlements: ProviderEntitlements;
  error: string;
};

export async function centreCanAcceptInquiry(sql: Sql, daycareId: string): Promise<InquiryAccept> {
  const entitlements = await loadCentreEntitlements(sql, daycareId);
  const used = await countCentreInquiriesThisMonth(sql, daycareId);
  if (!inquiryAtCap(used, entitlements.inquiryCap)) {
    return { ok: true, used, entitlements };
  }
  return {
    ok: false,
    used,
    entitlements,
    error: inquiryCapCopy(entitlements.stripeLive),
  };
}

export async function overlayFeaturedCity<T extends { id: string; featuredCity?: boolean }>(
  items: T[],
): Promise<T[]> {
  if (!items.length) return items;
  try {
    const sql = await getSql();
    const ids = [...new Set(items.map((item) => item.id).filter(Boolean))];
    if (!ids.length) return items;
    const rows = await sql.query<CentreOwnerPlanRow & { daycare_id: string }>(
      `select p.daycare_id, p.user_id, pr.selected_plan, pr.selected_addons, pr.stripe_subscription_status,
              pr.featured_city_status, pr.featured_city_centre_id
       from provider_daycares p
       left join profiles pr on pr.user_id = p.user_id
       where p.daycare_id = any($1::text[])`,
      [ids],
    );
    const byCentre = new Map<string, Array<CentreOwnerPlanRow & { daycare_id: string }>>();
    for (const row of rows) {
      const list = byCentre.get(row.daycare_id) ?? [];
      list.push(row);
      byCentre.set(row.daycare_id, list);
    }
    return items.map((item) => ({
      ...item,
      featuredCity: (byCentre.get(item.id) ?? []).some((row) => {
        const ent = resolveProviderEntitlements({
          plan: row.selected_plan,
          status: row.stripe_subscription_status,
          addons: row.selected_addons,
          stripeLive: stripeChargesLive(),
          featuredCityStatus: row.featured_city_status,
        });
        return featuredPinForCentre({
          pro: ent.entitledPlan === "pro",
          addonActive: ent.featuredFromAddon,
          purchasedCentreId: row.featured_city_centre_id,
          centreId: item.id,
        });
      }),
    }));
  } catch (err) {
    console.error("[kidease-featured] overlay failed", err);
    return items.map((item) => ({ ...item, featuredCity: Boolean(item.featuredCity) }));
  }
}

/** Centres whose paid pin belongs in this city or province search. */
export async function featuredCentreIdsInLock(lock: LocationLock | null): Promise<string[]> {
  if (!lock || !stripeChargesLive()) return [];
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; city: string | null; province: string | null }>`
      select distinct d.id, d.city, d.province
      from daycares d
      join provider_daycares pd on pd.daycare_id = d.id
      join profiles pr on pr.user_id = pd.user_id
      where (
        (pr.selected_plan = 'pro' and pr.stripe_subscription_status in ('active', 'trialing'))
        or (
          pr.featured_city_status in ('active', 'trialing')
          and position('featured_city' in coalesce(pr.selected_addons, '')) > 0
          and (pr.featured_city_centre_id is null or pr.featured_city_centre_id = d.id)
        )
      )
    `;
    return rows.filter((row) => listingMatchesLocationLock(row, lock)).map((row) => row.id);
  } catch (err) {
    console.error("[kidease-featured] lock lookup failed", err);
    return [];
  }
}

export function analyticsSinceDate(days: number, now = new Date()): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);
  return start.toISOString().slice(0, 10);
}

export { parseProviderAddons, isProviderPlanId };
