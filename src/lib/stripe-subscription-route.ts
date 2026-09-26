/**
 * Decide which profile lane a Stripe catalog event may write.
 * An add-on never updates the centre plan or Parent Plus, even when the
 * subscription id was previously stored on the plan column.
 */

export type CatalogLane =
  | "provider_plan"
  | "parent_plus"
  | "featured_city"
  | "claim_boost"
  | "job_post";

export type MatchedLane = CatalogLane | null;

export type CatalogWrite =
  | {
      lane: "provider_plan";
      userId: string;
      customerId: string | null;
      subscriptionId: string | null;
      checkoutSessionId: string | null;
      status: string;
      plan: string | null;
      interval: string | null;
      clearPlan: boolean;
    }
  | {
      lane: "parent_plus";
      userId: string;
      customerId: string | null;
      subscriptionId: string | null;
      checkoutSessionId: string | null;
      status: string;
      interval: string | null;
      clearPlan: boolean;
    }
  | {
      lane: "featured_city";
      userId: string;
      customerId: string | null;
      subscriptionId: string | null;
      checkoutSessionId: string | null;
      status: string;
      active: boolean;
      clearSubscription: boolean;
    }
  | {
      lane: "claim_boost";
      userId: string;
      customerId: string | null;
      checkoutSessionId: string;
      paymentId: string;
    }
  | {
      lane: "job_post";
      userId: string;
      customerId: string | null;
      checkoutSessionId: string;
      paymentId: string;
    }
  | { lane: "ignore"; reason: string };

export type CatalogEventInput = {
  type: string;
  metadata?: Record<string, string | undefined> | null;
  status?: string | null;
  paymentStatus?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
  userId?: string | null;
  checkoutSessionId?: string | null;
  paymentId?: string | null;
  matchedLane?: MatchedLane;
};

const PAID_CHECKOUT = new Set(["paid", "no_payment_required"]);
const CLEAR_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function resolveCatalogLane(input: {
  kind?: string | null;
  addon?: string | null;
  plan?: string | null;
  matchedLane?: MatchedLane;
}): CatalogLane | "none" {
  const kind = String(input.kind || "").trim();
  const addon = String(input.addon || "").trim();
  const plan = String(input.plan || "").trim();

  if (kind === "addon") {
    if (addon === "featured_city" || addon === "claim_boost" || addon === "job_post") return addon;
    return "none";
  }
  if (kind === "parent_plus") return "parent_plus";
  if (kind === "provider_sub") return "provider_plan";
  if (kind === "catalog" && (plan === "pro" || plan === "network")) return "provider_plan";
  if (input.matchedLane) return input.matchedLane;
  if (plan === "pro" || plan === "network") return "provider_plan";
  return "none";
}

function paidCheckout(paymentStatus: string | null | undefined): boolean {
  return PAID_CHECKOUT.has(String(paymentStatus || "").trim());
}

function statusFor(input: CatalogEventInput): string {
  const type = input.type || "";
  if (type === "invoice.payment_failed") return "past_due";
  if (type === "invoice.paid") return "active";
  if (type === "customer.subscription.deleted") return "canceled";
  if (type === "checkout.session.completed") {
    return paidCheckout(input.paymentStatus) ? "active" : "incomplete";
  }
  const status = String(input.status || "").trim();
  return status || "incomplete";
}

function meta(input: CatalogEventInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.metadata || {})) {
    if (value != null && String(value).trim()) out[key] = String(value).trim();
  }
  return out;
}

export function planCatalogWrite(input: CatalogEventInput): CatalogWrite {
  const type = input.type || "";
  const m = meta(input);
  const userId = String(input.userId || m.user_id || "").trim();
  const lane = resolveCatalogLane({
    kind: m.kidease,
    addon: m.addon,
    plan: m.plan,
    matchedLane: input.matchedLane ?? null,
  });
  const customerId = input.customerId || null;
  const subscriptionId = input.subscriptionId || null;
  const checkoutSessionId = String(input.checkoutSessionId || "").trim() || null;

  if (!userId) return { lane: "ignore", reason: "missing user" };
  if (lane === "none") return { lane: "ignore", reason: "unscoped" };
  if (m.kidease === "bill") return { lane: "ignore", reason: "bill" };

  if (type === "checkout.session.completed" && (lane === "claim_boost" || lane === "job_post")) {
    if (!paidCheckout(input.paymentStatus)) return { lane: "ignore", reason: "unpaid" };
    const paymentId = String(input.paymentId || checkoutSessionId || "").trim();
    if (!paymentId) return { lane: "ignore", reason: "missing payment" };
    const oneTime = {
      userId,
      customerId,
      checkoutSessionId: checkoutSessionId || paymentId,
      paymentId,
    };
    if (lane === "claim_boost") return { lane, ...oneTime };
    return { lane: "job_post", ...oneTime };
  }

  if (lane === "claim_boost" || lane === "job_post") {
    return { lane: "ignore", reason: "one-time add-on ignores subscription events" };
  }

  const status = statusFor(input);
  const clear = type === "customer.subscription.deleted" || CLEAR_STATUSES.has(status);

  const paidSession =
    type === "checkout.session.completed" && ACTIVE_STATUSES.has(status) ? checkoutSessionId : null;

  if (lane === "featured_city") {
    const active = !clear && ACTIVE_STATUSES.has(status);
    return {
      lane,
      userId,
      customerId,
      subscriptionId: clear ? null : subscriptionId,
      checkoutSessionId: paidSession,
      status: clear ? "canceled" : status,
      active,
      clearSubscription: clear,
    };
  }

  if (lane === "parent_plus") {
    return {
      lane,
      userId,
      customerId,
      subscriptionId: clear ? null : subscriptionId,
      checkoutSessionId: paidSession,
      status: clear ? "canceled" : status,
      interval: m.interval || null,
      clearPlan: clear,
    };
  }

  return {
    lane: "provider_plan",
    userId,
    customerId,
    subscriptionId: clear ? null : subscriptionId,
    checkoutSessionId: paidSession,
    status: clear ? "canceled" : status,
    plan: clear ? "free" : m.plan || null,
    interval: m.interval || null,
    clearPlan: clear,
  };
}

export function upgradeConfirmed(input: {
  kind: "plan" | "addon" | "plus";
  item?: string | null;
  sessionId?: string | null;
  confirmedSessionId?: string | null;
  entitledPlan?: string | null;
  subscriptionStatus?: string | null;
  featuredCityStatus?: string | null;
  claimBoostPaymentId?: string | null;
  jobPostPaymentIds?: string | null;
  plusPlan?: string | null;
  plusStatus?: string | null;
}): boolean {
  const sessionId = String(input.sessionId || "").trim();
  const confirmed = String(input.confirmedSessionId || "").trim();
  if (sessionId) return Boolean(confirmed) && confirmed === sessionId;

  const item = String(input.item || "").trim();
  if (input.kind === "plus") {
    return input.plusPlan === "plus" && (input.plusStatus === "active" || input.plusStatus === "trialing");
  }
  if (input.kind === "addon") {
    if (item === "featured_city") {
      return input.featuredCityStatus === "active" || input.featuredCityStatus === "trialing";
    }
    if (item === "claim_boost") return Boolean(input.claimBoostPaymentId);
    if (item === "job_post") return Boolean(String(input.jobPostPaymentIds || "").trim());
    return false;
  }
  const plan = input.entitledPlan;
  const paid = input.subscriptionStatus === "active" || input.subscriptionStatus === "trialing";
  if (!paid) return false;
  if (item === "pro" || item === "network") return plan === item;
  return plan === "pro" || plan === "network";
}

export function upgradeSuccessTitle(input: {
  kind: "plan" | "addon" | "plus";
  item?: string | null;
  locale?: "en" | "fr";
}): string {
  const fr = input.locale === "fr";
  const item = String(input.item || "").trim();
  if (input.kind === "plus") return fr ? "Vous êtes sur Plus parents" : "You're on Parent Plus";
  if (input.kind === "addon") {
    if (item === "featured_city") return fr ? "La ville en vedette est en ligne" : "Featured city is live";
    if (item === "claim_boost") return fr ? "Le boost de réclamation est actif" : "Claim boost is on";
    if (item === "job_post") return fr ? "L’offre d’emploi est prête" : "Job post is ready";
  }
  if (item === "network") return fr ? "Vous êtes sur Réseau" : "You're on Network";
  return fr ? "Vous êtes sur Pro" : "You're on Pro";
}
