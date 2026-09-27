import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { planCatalogWrite } from "../src/lib/stripe-subscription-route.ts";
import { billingPortalBody } from "../src/lib/server/stripe-checkout.ts";
import { parentAlertsEntitled, parentVideoEntitled } from "../src/lib/parent-plus.ts";
import {
  PAYMENT_FAILED_NOTICE,
  STRIPE_PORTAL_LIVE_SETTINGS,
  billingPriceLabel,
  billingStatusLine,
  cancelEndCopy,
  checkoutBlockedByLiveSubscription,
  mergePriceLane,
  priceLaneForId,
  subscriptionAccessOpen,
} from "../src/lib/subscription-lifecycle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const ENDS = "2026-10-26T16:00:00.000Z";

const centrePlan = {
  kidease: "provider_sub",
  role: "daycare",
  buyer: "daycare",
  user_id: "user_1",
  centre_id: "centre_a",
};

test("cancel at period end keeps the plan and resume clears only the flag", () => {
  const scheduled = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { ...centrePlan, plan: "pro", interval: "year" },
    status: "active",
    subscriptionId: "sub_pro",
    userId: "user_1",
    cancelAtPeriodEnd: true,
    periodEnd: ENDS,
  });
  assert.equal(scheduled.lane, "provider_plan");
  assert.equal(scheduled.plan, "pro");
  assert.equal(scheduled.clearPlan, false);
  assert.equal(scheduled.status, "active");
  assert.equal(scheduled.cancelAtPeriodEnd, true);
  assert.equal(scheduled.periodEnd, ENDS);
  assert.equal(scheduled.subscriptionId, "sub_pro");

  const resumed = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { ...centrePlan, plan: "pro", interval: "year" },
    status: "active",
    subscriptionId: "sub_pro",
    userId: "user_1",
    cancelAtPeriodEnd: false,
    periodEnd: ENDS,
  });
  assert.equal(resumed.clearPlan, false);
  assert.equal(resumed.plan, "pro");
  assert.equal(resumed.cancelAtPeriodEnd, false);
  assert.equal(resumed.subscriptionId, "sub_pro");

  const parentScheduled = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { kidease: "parent_plus", role: "parent", user_id: "user_1", plan: "alerts", interval: "month" },
    status: "active",
    subscriptionId: "sub_alerts",
    userId: "user_1",
    cancelAtPeriodEnd: true,
    periodEnd: ENDS,
  });
  assert.equal(parentScheduled.lane, "parent_plus");
  assert.equal(parentScheduled.plan, "alerts");
  assert.equal(parentScheduled.clearPlan, false);
  assert.equal(parentScheduled.cancelAtPeriodEnd, true);
});

test("period end drops the centre to Free and unfeatures without clearing other lanes", () => {
  const ended = planCatalogWrite({
    type: "customer.subscription.deleted",
    metadata: { ...centrePlan, plan: "pro", interval: "year" },
    status: "canceled",
    subscriptionId: "sub_pro",
    userId: "user_1",
    cancelAtPeriodEnd: true,
    periodEnd: ENDS,
  });
  assert.equal(ended.lane, "provider_plan");
  assert.equal(ended.plan, "free");
  assert.equal(ended.clearPlan, true);
  assert.equal(ended.subscriptionId, null);
  assert.equal(ended.cancelAtPeriodEnd, false);
  assert.equal(ended.periodEnd, null);

  const pinOff = planCatalogWrite({
    type: "customer.subscription.deleted",
    metadata: { kidease: "addon", addon: "featured_city", role: "daycare", user_id: "user_1", centre_id: "centre_a" },
    subscriptionId: "sub_pin",
    userId: "user_1",
  });
  assert.equal(pinOff.lane, "featured_city");
  assert.equal(pinOff.active, false);
  assert.equal(pinOff.clearSubscription, true);
  assert.equal(pinOff.status, "canceled");
  assert.equal(pinOff.centreId, "centre_a");

  const plusEnded = planCatalogWrite({
    type: "customer.subscription.deleted",
    metadata: { kidease: "parent_plus", role: "parent", user_id: "user_1", plan: "plus" },
    subscriptionId: "sub_plus",
    userId: "user_1",
  });
  assert.equal(plusEnded.lane, "parent_plus");
  assert.equal(plusEnded.plan, "free");
  assert.equal(plusEnded.clearPlan, true);
  assert.equal(plusEnded.subscriptionId, null);

  const lifecycle = src("src/lib/server/stripe-lifecycle.ts");
  const providerCancel = lifecycle.slice(
    lifecycle.indexOf("export async function applyProviderSubscription"),
    lifecycle.indexOf("export async function applyParentPlus"),
  );
  assert.match(providerCancel, /selected_plan = \$\{"free"\}/);
  assert.doesNotMatch(providerCancel, /job_post_credits|claim_boost|delete from/);
  const featuredCancel = lifecycle.slice(
    lifecycle.indexOf("async function applyFeaturedCity"),
    lifecycle.indexOf("function paymentIds"),
  );
  assert.match(featuredCancel, /featured_city_subscription_id = null/);
  assert.doesNotMatch(featuredCancel, /job_post_credits|claim_boost_payment_id|delete from/);
});

test("payment failed is grace: benefits stay and the notice is honest", () => {
  const failed = planCatalogWrite({
    type: "invoice.payment_failed",
    metadata: { ...centrePlan, plan: "network", interval: "month" },
    subscriptionId: "sub_network",
    userId: "user_1",
  });
  assert.equal(failed.lane, "provider_plan");
  assert.equal(failed.status, "past_due");
  assert.equal(failed.clearPlan, false);
  assert.equal(failed.plan, "network");
  assert.equal(failed.cancelAtPeriodEnd, null);
  assert.equal(subscriptionAccessOpen("past_due"), true);
  assert.equal(subscriptionAccessOpen("canceled"), false);
  assert.equal(subscriptionAccessOpen("unpaid"), false);
  assert.equal(parentVideoEntitled("plus", "past_due"), true);
  assert.equal(parentVideoEntitled("plus", "canceled"), false);
  assert.equal(parentAlertsEntitled("alerts", "past_due"), true);
  assert.match(PAYMENT_FAILED_NOTICE.en, /benefits stay on/);
  assert.doesNotMatch(PAYMENT_FAILED_NOTICE.en, /Congrats/);
});

test("a price change stays on the same subscription and does not cross roles", () => {
  const network = priceLaneForId("price_network_year", {
    network_yearly: "price_network_year",
    pro_monthly: "price_pro_month",
    featured_city: "price_pin",
  });
  const switched = mergePriceLane({
    metadata: { ...centrePlan, plan: "pro", interval: "month" },
    matchedLane: "provider_plan",
    priceLane: network,
  });
  assert.equal(switched.plan, "network");
  assert.equal(switched.interval, "year");
  const write = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: switched,
    status: "active",
    subscriptionId: "sub_same",
    userId: "user_1",
  });
  assert.equal(write.lane, "provider_plan");
  assert.equal(write.plan, "network");
  assert.equal(write.interval, "year");
  assert.equal(write.subscriptionId, "sub_same");
  assert.equal(write.clearPlan, false);

  const crossed = mergePriceLane({
    metadata: {},
    matchedLane: "provider_plan",
    priceLane: priceLaneForId("price_pin", { featured_city: "price_pin" }),
  });
  assert.equal(crossed.plan, undefined);
  const parentPrice = mergePriceLane({
    metadata: { kidease: "parent_plus", role: "parent", plan: "plus", interval: "month" },
    matchedLane: "parent_plus",
    priceLane: priceLaneForId("price_pro", { pro_monthly: "price_pro" }),
  });
  assert.equal(parentPrice.plan, "plus");
});

test("portal and cancel stay on the caller's own subscription", () => {
  const parentPortal = billingPortalBody({
    customerId: "cus_parent",
    returnUrl: "https://kidease.ca/parent?tab=payments&billing=return",
    subscriptionId: "sub_plus",
    configurationId: "bpc_parent",
  });
  assert.equal(parentPortal.customer, "cus_parent");
  assert.equal(parentPortal.configuration, "bpc_parent");
  assert.equal(parentPortal.flow_data.subscription_update.subscription, "sub_plus");
  assert.equal(parentPortal.flow_data.type, "subscription_update");

  const daycarePortal = billingPortalBody({
    customerId: "cus_centre",
    returnUrl: "https://kidease.ca/provider/subscription?billing=return",
    subscriptionId: "sub_pro",
    configurationId: "bpc_daycare",
  });
  assert.equal(daycarePortal.flow_data.subscription_update.subscription, "sub_pro");
  assert.notEqual(daycarePortal.flow_data.subscription_update.subscription, "sub_plus");

  const parent = src("src/lib/server/parent-plus.ts");
  const parentCancel = parent.slice(parent.indexOf("export const setParentPlusCancel"), parent.length);
  assert.ok(parentCancel.indexOf("assertParentBuyer") < parentCancel.indexOf("updateSubscriptionCancelAtPeriodEnd"));
  assert.match(parentCancel, /state\.subscriptionId/);
  assert.doesNotMatch(parentCancel, /stripe_subscription_id|featured_city_subscription_id/);

  const daycare = src("src/lib/server/provider-subscriptions.ts");
  const daycareCancel = daycare.slice(daycare.indexOf("export const setProviderSubscriptionCancel"));
  assert.ok(daycareCancel.indexOf("requireSubscriptionAccess") < daycareCancel.indexOf("updateSubscriptionCancelAtPeriodEnd"));
  assert.match(daycareCancel, /featuredCitySubscriptionId/);
  assert.match(daycareCancel, /state\.subscriptionId/);
  assert.doesNotMatch(daycareCancel, /plus_subscription_id/);
  assert.match(daycare, /throw new Error\(ALREADY_BILLED\)/);
  assert.match(parent, /checkoutBlockedByLiveSubscription/);
  const addon = daycare.slice(daycare.indexOf("export const startProviderAddonCheckout"), daycare.indexOf("export const postCentreJob"));
  assert.match(addon, /data\.addon === "featured_city"/);
  assert.match(addon, /checkoutBlockedByLiveSubscription\(state\.featuredCityStatus\)/);
  assert.doesNotMatch(addon, /claim_boost[\s\S]{0,80}checkoutBlockedByLiveSubscription/);
});

test("cancel confirmation names the end date and does not fire confetti", () => {
  const copy = cancelEndCopy({ product: "pro", endsAtIso: ENDS, locale: "en" });
  assert.equal(copy.title, "Your Pro plan will end on October 26, 2026.");
  assert.equal(copy.body, "You'll stay on Free.");
  const plus = cancelEndCopy({ product: "plus", endsAtIso: ENDS, locale: "en" });
  assert.equal(plus.title, "Your Parent Plus plan will end on October 26, 2026.");
  assert.equal(plus.body, "You'll stay on Free.");
  const pin = cancelEndCopy({ product: "featured_city", endsAtIso: ENDS, locale: "en" });
  assert.match(pin.title, /Featured city will end on October 26, 2026/);
  assert.match(pin.body, /centre plan is unchanged/);
  assert.equal(billingStatusLine({ cancelAtPeriodEnd: true, periodEnd: ENDS, locale: "en" }), "Cancels on October 26, 2026");
  assert.equal(billingStatusLine({ cancelAtPeriodEnd: false, periodEnd: ENDS, locale: "en" }), "Renews on October 26, 2026");
  assert.equal(billingPriceLabel({ product: "pro", interval: "year", locale: "en" }), "CA$490/year");
  assert.equal(billingPriceLabel({ product: "network", interval: "month", locale: "en" }), "CA$39/site/month");
  assert.equal(checkoutBlockedByLiveSubscription("active"), true);
  assert.equal(checkoutBlockedByLiveSubscription("canceled"), false);

  const card = src("src/components/manage-billing.tsx");
  assert.match(card, /quiet:\s*true/);
  assert.match(card, /Scheduled/);
  assert.doesNotMatch(card, /confetti:\s*true/);
  assert.doesNotMatch(card, /Good job/);
  const panel = src("src/components/provider-subscription.tsx");
  const hiddenCheckout = panel.slice(panel.indexOf("const planOpen"), panel.indexOf('className="space-y-8"'));
  assert.match(hiddenCheckout, /billingCards/);
  assert.match(hiddenCheckout, /if \(!showCheckout\)/);
  assert.match(hiddenCheckout, /plansNotOffered/);
  assert.match(card, /data-ke="manage-or-cancel"/);
  assert.match(card, /data-ke="billing-resume"/);
  assert.doesNotMatch(card, /claim_boost|job_post/);
  assert.match(STRIPE_PORTAL_LIVE_SETTINGS, /at period end/);
  assert.match(STRIPE_PORTAL_LIVE_SETTINGS, /Parent Plus and Parent Alerts/);
  assert.match(STRIPE_PORTAL_LIVE_SETTINGS, /Pro and Network/);
  assert.match(STRIPE_PORTAL_LIVE_SETTINGS, /Featured city is its own subscription/);
  assert.match(STRIPE_PORTAL_LIVE_SETTINGS, /Claim boost, Job post/);
});
