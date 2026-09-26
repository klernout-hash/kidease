import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STRIPE_CATALOG, addonCheckoutMode } from "../src/lib/server/stripe-catalog.ts";
import { checkCatalogPrice, checkoutModeForKind } from "../src/lib/stripe-price-mode.ts";
import {
  planCatalogWrite,
  resolveCatalogLane,
  upgradeConfirmed,
  upgradeSuccessTitle,
} from "../src/lib/stripe-subscription-route.ts";
import { mapCheckoutError, publicPayMessage, StripeApiError } from "../src/lib/stripe-public-error.ts";
import {
  canBuyDaycareUpgrade,
  canBuyParentUpgrade,
  catalogMetadataAllows,
  profileMayReceiveUpgrade,
  visibleUpgradeSide,
} from "../src/lib/upgrade-role.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const featured = STRIPE_CATALOG.find((item) => item.key === "featured_city");
const boost = STRIPE_CATALOG.find((item) => item.key === "claim_boost");
const job = STRIPE_CATALOG.find((item) => item.key === "job_post");
const pro = STRIPE_CATALOG.find((item) => item.key === "pro_monthly");

test("checkout mode follows the catalog and refuses a one-time Featured city price", () => {
  assert.equal(featured.kind, "recurring");
  assert.equal(featured.interval, "month");
  assert.equal(boost.kind, "one_time");
  assert.equal(job.kind, "one_time");
  assert.equal(checkoutModeForKind("recurring"), "subscription");
  assert.equal(checkoutModeForKind("one_time"), "payment");
  assert.equal(addonCheckoutMode("featured_city"), "subscription");
  assert.equal(addonCheckoutMode("claim_boost"), "payment");
  assert.equal(addonCheckoutMode("job_post"), "payment");
  assert.match(src("src/lib/server/provider-subscriptions.ts"), /mode: checked\.mode/);
  assert.doesNotMatch(src("src/lib/server/provider-subscriptions.ts"), /price_1[A-Za-z0-9]+/);

  const mismatch = checkCatalogPrice(featured, {
    id: "price_once",
    active: true,
    type: "one_time",
    currency: "cad",
    unit_amount: 2900,
    recurring: null,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.mode, null);
  assert.match(mismatch.friendly, /Nothing was charged/);
  assert.doesNotMatch(mismatch.friendly, /subscription mode|must provide/);
  assert.match(mismatch.note, /Expected recurring/);
  assert.match(mismatch.note, /one-time/);

  const monthly = checkCatalogPrice(featured, {
    id: "price_month",
    active: true,
    type: "recurring",
    currency: "cad",
    unit_amount: 2900,
    recurring: { interval: "month" },
  });
  assert.equal(monthly.ok, true);
  assert.equal(monthly.mode, "subscription");

  const once = checkCatalogPrice(boost, {
    id: "price_boost",
    active: true,
    type: "one_time",
    currency: "cad",
    unit_amount: 9900,
  });
  assert.equal(once.ok, true);
  assert.equal(once.mode, "payment");

  const usd = checkCatalogPrice(pro, {
    id: "price_usd",
    active: true,
    type: "recurring",
    currency: "usd",
    unit_amount: 4900,
    recurring: { interval: "month" },
  });
  assert.equal(usd.ok, false);
  assert.match(usd.friendly, /Canadian dollars/);
});

test("add-on webhooks never write the centre plan or Parent Plus", () => {
  assert.equal(
    resolveCatalogLane({ kind: "addon", addon: "featured_city", matchedLane: "provider_plan" }),
    "featured_city",
  );
  assert.equal(resolveCatalogLane({ kind: "addon", addon: "mystery", plan: "pro" }), "none");

  const created = planCatalogWrite({
    type: "customer.subscription.created",
    metadata: { kidease: "addon", addon: "featured_city", user_id: "user_1", plan: "pro" },
    status: "active",
    subscriptionId: "sub_featured",
    customerId: "cus_1",
    userId: "user_1",
    matchedLane: "provider_plan",
  });
  assert.equal(created.lane, "featured_city");
  assert.equal(created.active, true);
  assert.equal(created.subscriptionId, "sub_featured");

  const deleted = planCatalogWrite({
    type: "customer.subscription.deleted",
    metadata: { kidease: "addon", addon: "featured_city", user_id: "user_1" },
    status: "canceled",
    subscriptionId: "sub_featured",
    userId: "user_1",
    matchedLane: "provider_plan",
  });
  assert.equal(deleted.lane, "featured_city");
  assert.equal(deleted.clearSubscription, true);
  assert.equal(deleted.active, false);

  const invoice = planCatalogWrite({
    type: "invoice.paid",
    metadata: { kidease: "addon", addon: "featured_city", user_id: "user_1" },
    subscriptionId: "sub_featured",
    userId: "user_1",
  });
  assert.equal(invoice.lane, "featured_city");
  assert.equal(invoice.status, "active");

  const failed = planCatalogWrite({
    type: "invoice.payment_failed",
    metadata: { kidease: "addon", addon: "featured_city", user_id: "user_1" },
    subscriptionId: "sub_featured",
    userId: "user_1",
  });
  assert.equal(failed.lane, "featured_city");
  assert.equal(failed.status, "past_due");
  assert.equal(failed.active, false);

  const plan = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { kidease: "provider_sub", user_id: "user_1", plan: "pro", interval: "month" },
    status: "active",
    subscriptionId: "sub_plan",
    userId: "user_1",
  });
  assert.equal(plan.lane, "provider_plan");
  assert.equal(plan.plan, "pro");
  assert.equal(plan.clearPlan, false);

  const plus = planCatalogWrite({
    type: "invoice.paid",
    metadata: { kidease: "parent_plus", user_id: "user_1", interval: "year" },
    subscriptionId: "sub_plus",
    userId: "user_1",
  });
  assert.equal(plus.lane, "parent_plus");
  assert.equal(plus.status, "active");

  const boostPaid = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "addon", addon: "claim_boost", user_id: "user_1" },
    paymentStatus: "paid",
    checkoutSessionId: "cs_boost",
    paymentId: "pi_boost",
    userId: "user_1",
  });
  assert.equal(boostPaid.lane, "claim_boost");
  assert.equal(boostPaid.paymentId, "pi_boost");
  assert.equal(boostPaid.checkoutSessionId, "cs_boost");

  const unpaidPlan = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "provider_sub", user_id: "user_1", plan: "pro", interval: "month" },
    paymentStatus: "unpaid",
    checkoutSessionId: "cs_unpaid",
    subscriptionId: "sub_plan",
    userId: "user_1",
  });
  assert.equal(unpaidPlan.lane, "provider_plan");
  assert.equal(unpaidPlan.status, "incomplete");
  assert.equal(unpaidPlan.checkoutSessionId, null);

  const paidFeatured = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "addon", addon: "featured_city", user_id: "user_1" },
    paymentStatus: "paid",
    checkoutSessionId: "cs_feat",
    subscriptionId: "sub_featured",
    userId: "user_1",
    matchedLane: "provider_plan",
  });
  assert.equal(paidFeatured.lane, "featured_city");
  assert.equal(paidFeatured.checkoutSessionId, "cs_feat");
  assert.equal(paidFeatured.active, true);

  const boostUnpaid = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "addon", addon: "job_post", user_id: "user_1" },
    paymentStatus: "unpaid",
    checkoutSessionId: "cs_job",
    userId: "user_1",
  });
  assert.equal(boostUnpaid.lane, "ignore");

  const jobPaid = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "addon", addon: "job_post", user_id: "user_1" },
    paymentStatus: "paid",
    checkoutSessionId: "cs_job",
    paymentId: "pi_job",
    userId: "user_1",
  });
  assert.equal(jobPaid.lane, "job_post");

  const subEventForJob = planCatalogWrite({
    type: "customer.subscription.deleted",
    metadata: { kidease: "addon", addon: "job_post", user_id: "user_1" },
    userId: "user_1",
    matchedLane: "provider_plan",
  });
  assert.equal(subEventForJob.lane, "ignore");

  const lifecycle = src("src/lib/server/stripe-lifecycle.ts");
  const featuredFn = lifecycle.slice(lifecycle.indexOf("async function applyFeaturedCity"));
  const featuredBody = featuredFn.slice(0, featuredFn.indexOf("async function applyClaimBoost"));
  assert.doesNotMatch(featuredBody, /stripe_subscription_id/);
  assert.doesNotMatch(featuredBody, /selected_plan/);
  assert.doesNotMatch(featuredBody, /plus_plan/);
  assert.match(src("migrations/0062_provider_addon_billing.sql"), /featured_city_subscription_id/);
  assert.match(src("migrations/0062_provider_addon_billing.sql"), /job_post_credits/);
  assert.match(src("migrations/0062_provider_addon_billing.sql"), /stripe_checkout_errors/);
});

test("success copy waits for a confirmed checkout and hides raw Stripe errors", () => {
  assert.equal(
    upgradeConfirmed({
      kind: "addon",
      item: "featured_city",
      sessionId: "cs_1",
      confirmedSessionId: null,
      featuredCityStatus: "active",
    }),
    false,
  );
  assert.equal(
    upgradeConfirmed({
      kind: "addon",
      item: "featured_city",
      sessionId: "cs_1",
      confirmedSessionId: "cs_1",
    }),
    true,
  );
  assert.equal(
    upgradeConfirmed({
      kind: "plan",
      item: "pro",
      sessionId: "cs_pro",
      confirmedSessionId: "cs_other",
      entitledPlan: "pro",
      subscriptionStatus: "active",
    }),
    false,
  );
  assert.equal(upgradeSuccessTitle({ kind: "plan", item: "pro" }), "You're on Pro");
  assert.equal(upgradeSuccessTitle({ kind: "addon", item: "featured_city" }), "Featured city is live");
  assert.equal(upgradeSuccessTitle({ kind: "plus" }), "You're on Parent Plus");

  const raw = new StripeApiError(
    "You must provide at least one recurring price in `subscription` mode when using prices.",
    400,
  );
  const mapped = mapCheckoutError(raw);
  assert.equal(mapped.passthrough, false);
  assert.match(mapped.publicMessage, /Nothing was charged/);
  assert.match(mapped.detail, /recurring price/);
  assert.equal(
    publicPayMessage(raw, "Checkout could not start. Nothing was charged. Try again in a moment."),
    "Checkout could not start. Nothing was charged. Try again in a moment.",
  );

  const panel = src("src/components/provider-subscription.tsx");
  assert.match(panel, /confirmSuccess/);
  assert.match(panel, /CheckoutReturnNote/);
  assert.match(panel, /publicPayMessage/);
  assert.match(src("src/components/parent-plus.tsx"), /CheckoutReturnNote/);
  assert.match(src("src/components/admin-stripe-catalog.tsx"), /Recent checkout errors/);
  assert.match(src("src/routes/index.tsx"), /OptionalUpgrades/);
  assert.match(src("src/routes/index.tsx"), /showPayCtas\(\)/);
  assert.doesNotMatch(src("src/lib/site-footer-nav.ts"), /\/pricing|\/for-daycares/);
  assert.doesNotMatch(src("src/routes/index.tsx"), /\/pricing|\/for-daycares/);
});

test("parents and daycares cannot buy or receive each other's upgrades", () => {
  assert.equal(canBuyParentUpgrade({ role: "parent" }), true);
  assert.equal(canBuyParentUpgrade({ role: "provider", ownsCentre: true }), false);
  assert.equal(canBuyParentUpgrade({ role: "admin" }), true);
  assert.equal(canBuyDaycareUpgrade({ role: "parent" }), false);
  assert.equal(canBuyDaycareUpgrade({ role: "provider" }), false);
  assert.equal(canBuyDaycareUpgrade({ role: "provider", ownsCentre: true }), true);
  assert.equal(canBuyDaycareUpgrade({ role: "parent", linkedToCentre: true }), true);
  assert.equal(canBuyDaycareUpgrade({ role: "admin" }), true);

  assert.equal(visibleUpgradeSide({ role: "parent" }), "parent");
  assert.equal(visibleUpgradeSide({ role: "provider", ownsCentre: true }), "daycare");
  assert.equal(
    visibleUpgradeSide({ role: "parent", ownsCentre: true, activeDesk: "provider" }),
    "daycare",
  );
  assert.equal(
    visibleUpgradeSide({ role: "parent", ownsCentre: true, activeDesk: "parent" }),
    "parent",
  );
  assert.equal(visibleUpgradeSide({ role: "admin" }), "both");
  assert.equal(visibleUpgradeSide({ role: "support" }), "none");

  const parentBuyingPro = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "provider_sub", role: "parent", plan: "pro", user_id: "u1", buyer: "parent" },
    paymentStatus: "paid",
    userId: "u1",
    checkoutSessionId: "cs_role",
  });
  assert.equal(parentBuyingPro.lane, "ignore");
  assert.equal(parentBuyingPro.reason, "daycare upgrade on a parent checkout");

  const daycareBuyingPlus = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { kidease: "parent_plus", role: "daycare", plan: "plus", user_id: "u1", centre_id: "c1", buyer: "daycare" },
    status: "active",
    userId: "u1",
    subscriptionId: "sub_plus",
  });
  assert.equal(daycareBuyingPlus.lane, "ignore");
  assert.equal(daycareBuyingPlus.reason, "parent upgrade on a daycare checkout");

  const missingCentre = planCatalogWrite({
    type: "checkout.session.completed",
    metadata: { kidease: "provider_sub", role: "daycare", plan: "pro", user_id: "u1", buyer: "daycare" },
    paymentStatus: "paid",
    userId: "u1",
    checkoutSessionId: "cs_role",
  });
  assert.equal(missingCentre.lane, "ignore");
  assert.equal(missingCentre.reason, "daycare upgrade missing centre");

  const plus = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { kidease: "parent_plus", role: "parent", plan: "plus", user_id: "u1", buyer: "parent" },
    status: "active",
    userId: "u1",
    subscriptionId: "sub_plus",
  });
  assert.equal(plus.lane, "parent_plus");

  const pro = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: {
      kidease: "provider_sub",
      role: "daycare",
      plan: "pro",
      user_id: "u1",
      buyer: "daycare",
      centre_id: "c1",
    },
    status: "active",
    userId: "u1",
    subscriptionId: "sub_plan",
  });
  assert.equal(pro.lane, "provider_plan");

  const featuredOnParent = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { kidease: "addon", addon: "featured_city", role: "parent", user_id: "u1", buyer: "parent" },
    status: "active",
    userId: "u1",
    subscriptionId: "sub_featured",
  });
  assert.equal(featuredOnParent.lane, "ignore");

  const wrongProfile = planCatalogWrite({
    type: "customer.subscription.updated",
    metadata: { kidease: "parent_plus", role: "parent", plan: "plus", user_id: "u1", buyer: "parent" },
    status: "active",
    userId: "u1",
    profileUserId: "someone-else",
    subscriptionId: "sub_plus",
  });
  assert.equal(wrongProfile.lane, "ignore");
  assert.equal(wrongProfile.reason, "profile user mismatch");

  assert.equal(catalogMetadataAllows({ lane: "parent_plus" }).ok, true);
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "parent_plus",
      profileRole: "provider",
      metadataRole: "parent",
      buyer: "parent",
    }).ok,
    false,
  );
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "provider_plan",
      profileRole: "parent",
      metadataRole: "daycare",
      buyer: "daycare",
      centreId: "c1",
      linkedCentreIds: [],
    }).ok,
    false,
  );
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "provider_plan",
      profileRole: "parent",
      metadataRole: "daycare",
      buyer: "daycare",
      centreId: "c1",
      linkedCentreIds: ["c1"],
    }).ok,
    true,
  );
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "parent_plus",
      profileRole: "parent",
      metadataRole: "parent",
      buyer: "parent",
    }).ok,
    true,
  );
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "featured_city",
      profileRole: "admin",
      metadataRole: "daycare",
      buyer: "admin",
    }).ok,
    true,
  );
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "provider_plan",
      profileRole: "parent",
      linkedCentreIds: ["c1"],
    }).ok,
    true,
  );
  assert.equal(
    profileMayReceiveUpgrade({
      lane: "provider_plan",
      profileRole: "parent",
      linkedCentreIds: [],
    }).ok,
    false,
  );

  const parentCheckout = src("src/lib/server/parent-plus.ts");
  assert.match(parentCheckout, /canBuyParentUpgrade/);
  assert.match(parentCheckout, /role: "parent"/);
  assert.match(parentCheckout, /buyer: desks\.role === "admin" \? "admin" : "parent"/);
  const daycareCheckout = src("src/lib/server/provider-subscriptions.ts");
  assert.match(daycareCheckout, /canBuyDaycareUpgrade/);
  assert.match(daycareCheckout, /role: "daycare"/);
  assert.match(daycareCheckout, /centre_id: centres\[0\]/);
  assert.match(daycareCheckout, /daycareCheckoutMeta/);
  const lifecycle = src("src/lib/server/stripe-lifecycle.ts");
  assert.match(lifecycle, /profileMayReceiveUpgrade/);
  assert.match(lifecycle, /refused cross-role upgrade/);
  assert.match(src("src/routes/provider.subscription.tsx"), /canBuyDaycareUpgrade/);
  assert.match(src("src/routes/provider.subscription.tsx"), /Navigate to="\/parent"/);
  assert.match(src("src/routes/parent.tsx"), /canBuyParentUpgrade/);
  assert.match(src("src/routes/parent.tsx"), /Navigate to="\/provider\/subscription"/);
  const upgrades = src("src/components/optional-upgrades.tsx");
  assert.match(upgrades, /For families/);
  assert.match(upgrades, /For daycares/);
  assert.match(upgrades, /upgrades-families/);
  assert.match(upgrades, /upgrades-daycares/);
  assert.match(src("src/routes/index.tsx"), /visibleUpgradeSide/);
  const staffHidden = visibleDeskNav("daycare", {
    providerSubscriptions: true,
    centreOwner: false,
  }).some((item) => item.id === "subscription");
  const staffLinked = visibleDeskNav("daycare", {
    providerSubscriptions: true,
    centreOwner: false,
    centreLinked: true,
  }).some((item) => item.id === "subscription");
  assert.equal(staffHidden, false);
  assert.equal(staffLinked, true);
  assert.equal(
    visibleDeskNav("parent", { providerSubscriptions: true, centreLinked: true }).some((item) => item.id === "subscription"),
    false,
  );
});
