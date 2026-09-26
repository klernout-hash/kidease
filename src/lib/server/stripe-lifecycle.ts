import { getSql } from "@/lib/db";
import { extractStripeBillRef, type StripeBillObject } from "@/lib/stripe-bill-event";
import { isProviderInterval, isProviderPlanId, withProviderAddon, type ProviderInterval, type ProviderPlanId } from "@/lib/provider-plans";
import { isPlusInterval, type PlusInterval } from "@/lib/parent-plus";
import {
  planCatalogWrite,
  type CatalogLane,
  type CatalogWrite,
  type MatchedLane,
} from "@/lib/stripe-subscription-route";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { profileMayReceiveUpgrade, type CatalogUpgradeLane } from "@/lib/upgrade-role";

type Sql = Awaited<ReturnType<typeof getSql>>;

type MetaBag = Record<string, string | undefined> | null | undefined;

export type StripeLifecycleObject = StripeBillObject & {
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  status?: string | null;
  mode?: string | null;
  billing_reason?: string | null;
  amount_paid?: number | null;
  paid?: boolean | null;
  charge?: string | { id?: string } | null;
  payment_intent?: string | { id?: string } | null;
  invoice?: string | { id?: string } | null;
  lines?: {
    data?: Array<{
      metadata?: MetaBag;
      price?: { metadata?: MetaBag } | null;
    }> | null;
  } | null;
  subscription_details?: {
    metadata?: MetaBag;
    subscription?: string | { id?: string } | null;
  } | null;
  parent?: {
    subscription_details?: {
      metadata?: MetaBag;
      subscription?: string | { id?: string } | null;
    } | null;
  } | null;
};

function asId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  return value.id || null;
}

function absorb(out: Record<string, string>, raw: MetaBag) {
  if (!raw) return;
  for (const [key, value] of Object.entries(raw)) {
    if (value != null && String(value).trim() && !out[key]) out[key] = String(value).trim();
  }
}

export function collectStripeMeta(obj: StripeLifecycleObject | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  absorb(out, obj?.metadata);
  absorb(out, obj?.subscription_details?.metadata);
  absorb(out, obj?.parent?.subscription_details?.metadata);
  for (const line of obj?.lines?.data || []) {
    absorb(out, line?.metadata);
    absorb(out, line?.price?.metadata);
  }
  return out;
}

function subscriptionIdOf(obj: StripeLifecycleObject): string | null {
  if (obj.object === "subscription") return obj.id || null;
  return (
    asId(obj.subscription) ||
    asId(obj.subscription_details?.subscription) ||
    asId(obj.parent?.subscription_details?.subscription)
  );
}

async function findProfile(
  sql: Sql,
  refs: { userId?: string | null; customerId?: string | null; subscriptionId?: string | null },
): Promise<{ user_id: string; matched: MatchedLane } | null> {
  const subscriptionId = refs.subscriptionId || null;
  if (refs.userId) {
    const rows = await sql<{ user_id: string; matched: MatchedLane }>`
      select user_id,
        case
          when ${subscriptionId}::text is not null and featured_city_subscription_id = ${subscriptionId} then 'featured_city'
          when ${subscriptionId}::text is not null and plus_subscription_id = ${subscriptionId} then 'parent_plus'
          when ${subscriptionId}::text is not null and stripe_subscription_id = ${subscriptionId} then 'provider_plan'
          else null
        end as matched
      from profiles
      where user_id = ${refs.userId}
      limit 1
    `;
    if (rows[0]) return rows[0];
  }
  if (subscriptionId) {
    const rows = await sql<{ user_id: string; matched: MatchedLane }>`
      select user_id,
        case
          when featured_city_subscription_id = ${subscriptionId} then 'featured_city'
          when plus_subscription_id = ${subscriptionId} then 'parent_plus'
          when stripe_subscription_id = ${subscriptionId} then 'provider_plan'
          else null
        end as matched
      from profiles
      where featured_city_subscription_id = ${subscriptionId}
         or plus_subscription_id = ${subscriptionId}
         or stripe_subscription_id = ${subscriptionId}
      limit 1
    `;
    if (rows[0]) return rows[0];
  }
  if (refs.customerId) {
    const rows = await sql<{ user_id: string }>`
      select user_id from profiles where stripe_customer_id = ${refs.customerId} limit 1
    `;
    if (rows[0]) return { user_id: rows[0].user_id, matched: null };
  }
  return null;
}

async function rememberCustomer(sql: Sql, userId: string, customerId: string | null) {
  if (!customerId) return;
  await sql`
    update profiles
    set stripe_customer_id = coalesce(stripe_customer_id, ${customerId})
    where user_id = ${userId}
  `;
}

async function rememberSession(sql: Sql, userId: string, sessionId: string | null) {
  if (!sessionId) return;
  await sql`
    update profiles
    set catalog_checkout_session_id = ${sessionId}
    where user_id = ${userId}
  `;
}

export async function applyProviderSubscription(
  sql: Sql,
  input: {
    userId: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    status?: string | null;
    plan?: string | null;
    interval?: string | null;
    checkoutSessionId?: string | null;
  },
) {
  await rememberCustomer(sql, input.userId, input.customerId ?? null);
  const plan: ProviderPlanId | null = isProviderPlanId(input.plan) ? input.plan : null;
  const interval: ProviderInterval | null = isProviderInterval(input.interval) ? input.interval : null;
  const status = (input.status || "").trim() || null;
  const canceled = status === "canceled" || status === "unpaid" || status === "incomplete_expired";
  await sql`
    update profiles set
      stripe_subscription_id = coalesce(${input.subscriptionId ?? null}, stripe_subscription_id),
      stripe_subscription_status = coalesce(${status}, stripe_subscription_status),
      selected_plan = coalesce(${canceled ? "free" : plan}, selected_plan),
      selected_interval = coalesce(${interval}, selected_interval),
      selected_plan_at = now(),
      catalog_checkout_session_id = coalesce(${input.checkoutSessionId ?? null}, catalog_checkout_session_id)
    where user_id = ${input.userId}
  `;
  if (canceled) {
    await sql`
      update profiles set
        stripe_subscription_id = null,
        stripe_subscription_status = ${status},
        selected_plan = ${"free"}
      where user_id = ${input.userId}
    `;
  }
}

export async function applyParentPlus(
  sql: Sql,
  input: {
    userId: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    status?: string | null;
    interval?: string | null;
    plan?: string | null;
    checkoutSessionId?: string | null;
  },
) {
  await rememberCustomer(sql, input.userId, input.customerId ?? null);
  const interval: PlusInterval | null = isPlusInterval(input.interval) ? input.interval : null;
  const status = (input.status || "").trim() || null;
  const canceled = status === "canceled" || status === "unpaid" || status === "incomplete_expired";
  const requested = input.plan === "alerts" ? "alerts" : "plus";
  const plusPlan = canceled ? "free" : requested;
  await sql`
    update profiles set
      plus_subscription_id = coalesce(${canceled ? null : input.subscriptionId ?? null}, plus_subscription_id),
      plus_status = coalesce(${status}, plus_status),
      plus_plan = ${plusPlan},
      plus_interval = coalesce(${interval}, plus_interval),
      plus_selected_at = now(),
      catalog_checkout_session_id = coalesce(${input.checkoutSessionId ?? null}, catalog_checkout_session_id)
    where user_id = ${input.userId}
  `;
  if (canceled) {
    await sql`
      update profiles set
        plus_subscription_id = null,
        plus_status = ${status},
        plus_plan = ${"free"}
      where user_id = ${input.userId}
    `;
  }
}

async function bumpClaimPriority(sql: Sql, userId: string, centreId: string | null): Promise<boolean> {
  const target = String(centreId || "").trim() || null;
  const rows = await sql<{ id: string }>`
    update daycares d
    set priority_until = greatest(coalesce(d.priority_until, now()), now()) + interval '30 days'
    from provider_daycares p
    where p.daycare_id = d.id
      and p.user_id = ${userId}
      and (${target}::text is null or d.id = ${target})
    returning d.id
  `;
  return rows.length > 0;
}

/** Apply a paid Claim boost that arrived before the centre was linked. */
export async function applyPendingClaimBoost(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{
    claim_boost_paid_at: string | null;
    claim_boost_applied_at: string | null;
    claim_boost_centre_id: string | null;
  }>`
    select claim_boost_paid_at, claim_boost_applied_at, claim_boost_centre_id
    from profiles
    where user_id = ${userId}
    limit 1
  `;
  const row = rows[0];
  if (!row?.claim_boost_paid_at || row.claim_boost_applied_at) return false;
  const bumped = await bumpClaimPriority(sql, userId, row.claim_boost_centre_id);
  if (!bumped) return false;
  await sql`
    update profiles set claim_boost_applied_at = now() where user_id = ${userId}
  `;
  return true;
}

async function applyFeaturedCity(
  sql: Sql,
  input: Extract<CatalogWrite, { lane: "featured_city" }>,
) {
  await rememberCustomer(sql, input.userId, input.customerId);
  const rows = await sql<{ selected_addons: string | null }>`
    select selected_addons from profiles where user_id = ${input.userId} limit 1
  `;
  const addons = withProviderAddon(rows[0]?.selected_addons, "featured_city", input.active);
  const centreId = input.centreId || null;
  if (input.clearSubscription) {
    await sql`
      update profiles set
        featured_city_subscription_id = null,
        featured_city_status = ${input.status},
        featured_city_centre_id = coalesce(${centreId}, featured_city_centre_id),
        selected_addons = ${addons},
        catalog_checkout_session_id = coalesce(${input.checkoutSessionId}, catalog_checkout_session_id)
      where user_id = ${input.userId}
    `;
    return;
  }
  await sql`
    update profiles set
      featured_city_subscription_id = coalesce(${input.subscriptionId}, featured_city_subscription_id),
      featured_city_status = ${input.status},
      featured_city_centre_id = coalesce(${centreId}, featured_city_centre_id),
      selected_addons = ${addons},
      catalog_checkout_session_id = coalesce(${input.checkoutSessionId}, catalog_checkout_session_id)
    where user_id = ${input.userId}
  `;
}

function paymentIds(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function applyClaimBoost(sql: Sql, input: Extract<CatalogWrite, { lane: "claim_boost" }>) {
  await rememberCustomer(sql, input.userId, input.customerId);
  const rows = await sql<{
    claim_boost_payment_id: string | null;
    claim_boost_applied_at: string | null;
    claim_boost_centre_id: string | null;
    selected_addons: string | null;
  }>`
    select claim_boost_payment_id, claim_boost_applied_at, claim_boost_centre_id, selected_addons
    from profiles
    where user_id = ${input.userId}
    limit 1
  `;
  const row = rows[0];
  const centreId = input.centreId || row?.claim_boost_centre_id || null;
  const ids = paymentIds(row?.claim_boost_payment_id);
  if (ids.includes(input.paymentId)) {
    if (!row?.claim_boost_applied_at) {
      const bumped = await bumpClaimPriority(sql, input.userId, centreId);
      if (bumped) {
        await sql`
          update profiles set claim_boost_applied_at = now() where user_id = ${input.userId}
        `;
      }
    }
    await rememberSession(sql, input.userId, input.checkoutSessionId);
    return;
  }
  const nextIds = [...ids, input.paymentId].slice(-20).join(",");
  const addons = withProviderAddon(row?.selected_addons, "claim_boost", true);
  await sql`
    update profiles set
      claim_boost_payment_id = ${nextIds},
      claim_boost_paid_at = now(),
      claim_boost_applied_at = null,
      claim_boost_centre_id = coalesce(${centreId}, claim_boost_centre_id),
      selected_addons = ${addons},
      catalog_checkout_session_id = ${input.checkoutSessionId}
    where user_id = ${input.userId}
  `;
  const bumped = await bumpClaimPriority(sql, input.userId, centreId);
  if (bumped) {
    await sql`
      update profiles set claim_boost_applied_at = now() where user_id = ${input.userId}
    `;
  }
}

async function applyJobPost(sql: Sql, input: Extract<CatalogWrite, { lane: "job_post" }>) {
  await rememberCustomer(sql, input.userId, input.customerId);
  const rows = await sql<{
    job_post_credits: number | null;
    job_post_payment_ids: string | null;
    job_post_centre_id: string | null;
    selected_addons: string | null;
  }>`
    select job_post_credits, job_post_payment_ids, job_post_centre_id, selected_addons
    from profiles
    where user_id = ${input.userId}
    limit 1
  `;
  const row = rows[0];
  const ids = paymentIds(row?.job_post_payment_ids);
  if (ids.includes(input.paymentId)) {
    await rememberSession(sql, input.userId, input.checkoutSessionId);
    return;
  }
  const nextIds = [...ids, input.paymentId].slice(-20).join(",");
  const credits = Math.max(0, Number(row?.job_post_credits) || 0) + 1;
  const addons = withProviderAddon(row?.selected_addons, "job_post", true);
  const centreId = input.centreId || null;
  const inserted = await sql<{ payment_id: string }>`
    insert into centre_job_credits (payment_id, user_id, daycare_id)
    values (${input.paymentId}, ${input.userId}, ${centreId})
    on conflict (payment_id) do nothing
    returning payment_id
  `;
  if (!inserted[0]) {
    await rememberSession(sql, input.userId, input.checkoutSessionId);
    return;
  }
  await sql`
    update profiles set
      job_post_credits = ${credits},
      job_post_payment_ids = ${nextIds},
      job_post_centre_id = coalesce(${centreId}, job_post_centre_id),
      selected_addons = ${addons},
      catalog_checkout_session_id = ${input.checkoutSessionId}
    where user_id = ${input.userId}
  `;
}

async function profileMayReceiveCatalogWrite(
  sql: Sql,
  write: Extract<CatalogWrite, { lane: CatalogUpgradeLane }>,
  metadata: Record<string, string>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${write.userId} limit 1
  `;
  const centres = await listAccessibleDaycareIds(sql, write.userId);
  return profileMayReceiveUpgrade({
    lane: write.lane,
    profileRole: rows[0]?.role ?? null,
    linkedCentreIds: centres,
    centreId: metadata.centre_id,
    metadataRole: metadata.role,
    buyer: metadata.buyer,
  });
}

async function applyCatalogWrite(sql: Sql, write: CatalogWrite) {
  if (write.lane === "ignore") return;
  if (write.lane === "provider_plan") {
    await applyProviderSubscription(sql, write);
    return;
  }
  if (write.lane === "parent_plus") {
    await applyParentPlus(sql, write);
    return;
  }
  if (write.lane === "featured_city") {
    await applyFeaturedCity(sql, write);
    return;
  }
  if (write.lane === "claim_boost") {
    await applyClaimBoost(sql, write);
    return;
  }
  await applyJobPost(sql, write);
}

export async function applyStripeDisputeEvent(input: {
  type: string;
  object?: StripeLifecycleObject | null;
}): Promise<{ ok: true; billId: string | null; handled: string }> {
  const obj = input.object || {};
  const chargeId = asId(obj.charge) || (obj.object === "charge" ? obj.id || null : null);
  const ref = extractStripeBillRef(
    {
      id: chargeId || obj.id,
      object: "charge",
      metadata: obj.metadata,
      payment_intent: obj.payment_intent,
    },
    "charge.dispute.created",
  );
  const sql = await getSql();
  let billId = ref.billId;
  if (!billId && chargeId) {
    const rows = await sql<{ id: string }>`
      select id from invoices where stripe_charge_id = ${chargeId} limit 1
    `.catch(() => []);
    billId = rows[0]?.id ?? null;
  }
  if (!billId && ref.paymentIntentId) {
    const rows = await sql<{ id: string }>`
      select id from invoices where stripe_payment_intent_id = ${ref.paymentIntentId} limit 1
    `.catch(() => []);
    billId = rows[0]?.id ?? null;
  }
  if (!billId) return { ok: true, billId: null, handled: input.type };
  const disputeId = obj.id || null;
  await sql`
    update invoices set
      status = ${"disputed"},
      stripe_dispute_id = coalesce(${disputeId}, stripe_dispute_id),
      disputed_at = coalesce(disputed_at, now()),
      updated_at = now()
    where id = ${billId}
  `.catch(() => undefined);
  await sql`update payments set status = ${"disputed"} where invoice_id = ${billId}`.catch(() => undefined);
  return { ok: true, billId, handled: input.type };
}

export async function applyStripeSubscriptionEvent(input: {
  type: string;
  object?: StripeLifecycleObject | null;
}): Promise<{ ok: true; userId: string | null; handled: string; lane: CatalogLane | "ignore" }> {
  const type = input.type || "";
  const obj = input.object || {};
  const sql = await getSql();
  const metadata = collectStripeMeta(obj);
  if (type === "checkout.session.completed" && metadata.kidease === "bill") {
    return { ok: true, userId: null, handled: type, lane: "ignore" };
  }

  const subscriptionId = subscriptionIdOf(obj);
  const customerId = asId(obj.customer);
  const hintedUser = metadata.user_id || obj.client_reference_id || null;
  const profile = await findProfile(sql, {
    userId: hintedUser,
    customerId,
    subscriptionId,
  });
  const write = planCatalogWrite({
    type,
    metadata,
    status: obj.status,
    paymentStatus: obj.payment_status,
    subscriptionId,
    customerId,
    userId: hintedUser || profile?.user_id || null,
    checkoutSessionId: type === "checkout.session.completed" ? obj.id || null : null,
    paymentId: asId(obj.payment_intent) || (type === "checkout.session.completed" ? obj.id || null : null),
    matchedLane: metadata.kidease ? null : profile?.matched ?? null,
    profileUserId: profile?.user_id ?? null,
  });
  if (write.lane === "ignore") {
    return { ok: true, userId: profile?.user_id ?? null, handled: type, lane: "ignore" };
  }
  const allowed = await profileMayReceiveCatalogWrite(sql, write, metadata);
  if (!allowed.ok) {
    console.error("[kidease-sub] refused cross-role upgrade", allowed.reason, write.lane, write.userId);
    return { ok: true, userId: write.userId, handled: type, lane: "ignore" };
  }
  await applyCatalogWrite(sql, write);
  return { ok: true, userId: write.userId, handled: type, lane: write.lane };
}

export const STRIPE_LIFECYCLE_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.dispute.created",
] as const;
