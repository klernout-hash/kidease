import { getSql } from "@/lib/db";
import { extractStripeBillRef, type StripeBillObject } from "@/lib/stripe-bill-event";
import { isProviderInterval, isProviderPlanId, type ProviderInterval, type ProviderPlanId } from "@/lib/provider-plans";
import { isPlusInterval, type PlusInterval } from "@/lib/parent-plus";

type Sql = Awaited<ReturnType<typeof getSql>>;

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
  lines?: { data?: Array<{ metadata?: Record<string, string | undefined> | null }> } | null;
};

function asId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  return value.id || null;
}

function meta(obj: StripeLifecycleObject | null | undefined): Record<string, string> {
  const raw = obj?.metadata || {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v != null && String(v).trim()) out[k] = String(v);
  }
  return out;
}

function kindOf(obj: StripeLifecycleObject | null | undefined): string {
  return (meta(obj).kidease || "").trim();
}

async function findProfile(
  sql: Sql,
  refs: { userId?: string | null; customerId?: string | null; subscriptionId?: string | null },
): Promise<{ user_id: string } | null> {
  if (refs.userId) {
    const rows = await sql<{ user_id: string }>`
      select user_id from profiles where user_id = ${refs.userId} limit 1
    `.catch(() => []);
    if (rows[0]) return rows[0];
  }
  if (refs.subscriptionId) {
    const rows = await sql<{ user_id: string }>`
      select user_id from profiles
      where stripe_subscription_id = ${refs.subscriptionId}
         or plus_subscription_id = ${refs.subscriptionId}
      limit 1
    `.catch(() => []);
    if (rows[0]) return rows[0];
  }
  if (refs.customerId) {
    const rows = await sql<{ user_id: string }>`
      select user_id from profiles where stripe_customer_id = ${refs.customerId} limit 1
    `.catch(() => []);
    if (rows[0]) return rows[0];
  }
  return null;
}

async function rememberCustomer(sql: Sql, userId: string, customerId: string | null) {
  if (!customerId) return;
  await sql`
    update profiles
    set stripe_customer_id = coalesce(stripe_customer_id, ${customerId})
    where user_id = ${userId}
  `.catch(() => undefined);
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
      selected_plan_at = now()
    where user_id = ${input.userId}
  `.catch(() => undefined);
  if (canceled) {
    await sql`
      update profiles set
        stripe_subscription_id = null,
        stripe_subscription_status = ${status},
        selected_plan = ${"free"}
      where user_id = ${input.userId}
    `.catch(() => undefined);
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
  },
) {
  await rememberCustomer(sql, input.userId, input.customerId ?? null);
  const interval: PlusInterval | null = isPlusInterval(input.interval) ? input.interval : null;
  const status = (input.status || "").trim() || null;
  const canceled = status === "canceled" || status === "unpaid" || status === "incomplete_expired";
  const plusPlan = canceled ? "free" : "plus";
  await sql`
    update profiles set
      plus_subscription_id = coalesce(${canceled ? null : input.subscriptionId ?? null}, plus_subscription_id),
      plus_status = coalesce(${status}, plus_status),
      plus_plan = ${plusPlan},
      plus_interval = coalesce(${interval}, plus_interval),
      plus_selected_at = now()
    where user_id = ${input.userId}
  `.catch(() => undefined);
  if (canceled) {
    await sql`
      update profiles set
        plus_subscription_id = null,
        plus_status = ${status},
        plus_plan = ${"free"}
      where user_id = ${input.userId}
    `.catch(() => undefined);
  }
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

function subscriptionRefs(obj: StripeLifecycleObject) {
  const m = meta(obj);
  return {
    userId: m.user_id || obj.client_reference_id || null,
    customerId: asId(obj.customer),
    subscriptionId: obj.object === "subscription" ? obj.id || null : asId(obj.subscription),
    status: obj.status || null,
    plan: m.plan || null,
    interval: m.interval || null,
    kind: m.kidease || kindOf(obj),
    addon: m.addon || null,
  };
}

export async function applyStripeSubscriptionEvent(input: {
  type: string;
  object?: StripeLifecycleObject | null;
}): Promise<{ ok: true; userId: string | null; handled: string }> {
  const type = input.type || "";
  const obj = input.object || {};
  const sql = await getSql();

  if (type === "checkout.session.completed") {
    const m = meta(obj);
    const kind = m.kidease || "";
    if (kind === "bill") return { ok: true, userId: null, handled: type };
    const userId = m.user_id || obj.client_reference_id || null;
    const customerId = asId(obj.customer);
    const subscriptionId = asId(obj.subscription);
    if (!userId) return { ok: true, userId: null, handled: type };
    await rememberCustomer(sql, userId, customerId);
    if (kind === "provider_sub" || (kind === "catalog" && m.plan)) {
      await applyProviderSubscription(sql, {
        userId,
        customerId,
        subscriptionId,
        status: obj.status || (obj.payment_status === "paid" ? "active" : "incomplete"),
        plan: m.plan,
        interval: m.interval,
      });
    }
    if (kind === "parent_plus") {
      await applyParentPlus(sql, {
        userId,
        customerId,
        subscriptionId,
        status: obj.status || (obj.payment_status === "paid" ? "active" : "incomplete"),
        interval: m.interval,
      });
    }
    if (kind === "addon" && m.addon) {
      await rememberCustomer(sql, userId, customerId);
    }
    return { ok: true, userId, handled: type };
  }

  const refs = subscriptionRefs(obj);
  const profile = await findProfile(sql, refs);
  if (!profile) return { ok: true, userId: null, handled: type };

  const kind = refs.kind;
  const looksPlus =
    kind === "parent_plus" ||
    (await sql<{ n: number }>`
      select count(*)::int as n from profiles
      where user_id = ${profile.user_id} and plus_subscription_id = ${refs.subscriptionId}
    `.catch(() => [{ n: 0 }]))[0]?.n;

  if (type === "customer.subscription.deleted" || refs.status === "canceled") {
    if (looksPlus) {
      await applyParentPlus(sql, { ...refs, userId: profile.user_id, status: "canceled" });
    } else {
      await applyProviderSubscription(sql, { ...refs, userId: profile.user_id, status: "canceled" });
    }
    return { ok: true, userId: profile.user_id, handled: type };
  }

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "invoice.paid" ||
    type === "invoice.payment_failed"
  ) {
    const status =
      type === "invoice.payment_failed"
        ? "past_due"
        : type === "invoice.paid"
          ? "active"
          : refs.status;
    if (kind === "parent_plus" || looksPlus) {
      await applyParentPlus(sql, { ...refs, userId: profile.user_id, status });
    } else if (kind === "provider_sub" || kind === "addon" || refs.plan || refs.subscriptionId) {
      await applyProviderSubscription(sql, { ...refs, userId: profile.user_id, status });
    } else {
      await rememberCustomer(sql, profile.user_id, refs.customerId);
    }
    return { ok: true, userId: profile.user_id, handled: type };
  }

  return { ok: true, userId: profile.user_id, handled: type };
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
