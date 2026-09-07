import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  FREE_ANALYTICS_DAYS,
  FREE_INQUIRY_CAP,
  PRO_ANALYTICS_DAYS,
  entitledProviderPlan,
  inquiryAtCap,
  inquiryRemaining,
  providerFeatureGate,
  resolveProviderEntitlements,
  sortFeaturedCityAfterPriority,
} from "../src/lib/provider-entitlements.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("rehearsal Pro pick is not a paid entitlement", () => {
  assert.equal(entitledProviderPlan({ plan: "pro", status: null, stripeLive: false }), "free");
  assert.equal(entitledProviderPlan({ plan: "network", status: "active", stripeLive: false }), "free");
  assert.equal(entitledProviderPlan({ plan: "pro", status: "incomplete", stripeLive: true }), "free");
  assert.equal(entitledProviderPlan({ plan: "pro", status: "active", stripeLive: true }), "pro");
  assert.equal(entitledProviderPlan({ plan: "network", status: "trialing", stripeLive: true }), "network");
  assert.equal(entitledProviderPlan({ plan: "network", status: "canceled", stripeLive: true }), "free");
});

test("Free keeps listing basics; Pro/Network extras fail closed until live+active", () => {
  const rehearsal = resolveProviderEntitlements({
    plan: "pro",
    status: null,
    addons: "featured_city",
    stripeLive: false,
  });
  assert.equal(rehearsal.entitledPlan, "free");
  assert.equal(rehearsal.paid, false);
  assert.equal(rehearsal.unlimitedInquiries, false);
  assert.equal(rehearsal.featuredCity, false);
  assert.equal(rehearsal.analyticsDays, FREE_ANALYTICS_DAYS);
  assert.equal(rehearsal.orgDashboard, false);
  assert.equal(rehearsal.inquiryCap, FREE_INQUIRY_CAP);
  assert.deepEqual(providerFeatureGate("unlimited_inquiries", rehearsal), {
    ok: false,
    reason: "plan_required_billing_not_live",
  });

  const livePro = resolveProviderEntitlements({
    plan: "pro",
    status: "active",
    addons: "",
    stripeLive: true,
  });
  assert.equal(livePro.entitledPlan, "pro");
  assert.equal(livePro.unlimitedInquiries, true);
  assert.equal(livePro.featuredCity, true);
  assert.equal(livePro.analyticsDays, PRO_ANALYTICS_DAYS);
  assert.equal(livePro.orgDashboard, false);
  assert.equal(livePro.inquiryCap, null);
  assert.deepEqual(providerFeatureGate("featured_city", livePro), { ok: true });

  const liveNetwork = resolveProviderEntitlements({
    plan: "network",
    status: "active",
    addons: "",
    stripeLive: true,
  });
  assert.equal(liveNetwork.orgDashboard, true);
  assert.equal(liveNetwork.featuredCity, false);
  const networkAddon = resolveProviderEntitlements({
    plan: "network",
    status: "active",
    addons: "featured_city",
    stripeLive: true,
  });
  assert.equal(networkAddon.featuredCity, true);
});

test("Free inquiry cap is 10 and paid is unlimited", () => {
  assert.equal(inquiryAtCap(10, FREE_INQUIRY_CAP), true);
  assert.equal(inquiryAtCap(9, FREE_INQUIRY_CAP), false);
  assert.equal(inquiryRemaining(3, FREE_INQUIRY_CAP), 7);
  assert.equal(inquiryAtCap(99, null), false);
  assert.equal(inquiryRemaining(4, null), null);
});

test("featured-city pin sorts after priority and never touches quality weights", () => {
  const ranked = sortFeaturedCityAfterPriority([
    { id: "a", live: true },
    { id: "b", featuredCity: true, live: true },
    { id: "c", priority: true, live: true },
  ]);
  assert.deepEqual(
    ranked.map((item) => item.id),
    ["c", "b", "a"],
  );
  assert.match(src("src/lib/quality.ts"), /trust: 25/);
  const quality = src("src/lib/quality.ts");
  assert.match(quality, /Paid Pro \/ Network/);
  assert.doesNotMatch(quality, /selected_plan/);
  assert.doesNotMatch(quality, /featuredCity \? 10/);
  assert.doesNotMatch(src("src/lib/server/quality.ts"), /selected_plan/);
  assert.match(src("src/lib/server/daycares.ts"), /overlayFeaturedCity/);
  assert.match(src("src/lib/server/daycares.ts"), /overlayQuality/);
  assert.ok(
    src("src/lib/server/daycares.ts").indexOf("overlayQuality") <
      src("src/lib/server/daycares.ts").indexOf("overlayFeaturedCity"),
  );
});

test("centre desk shows live Free/Pro/Network and gates inquiries", () => {
  const desk = src("src/routes/provider.tsx");
  const banner = src("src/components/provider-plan-banner.tsx");
  const family = src("src/lib/server/family.ts");
  const tours = src("src/lib/server/tours.ts");
  assert.match(desk, /ProviderPlanBanner/);
  assert.match(banner, /planCurrent/);
  assert.match(banner, /provider\/subscription/);
  assert.match(family, /centreCanAcceptInquiry/);
  assert.match(family, /loadProfileEntitlements/);
  assert.match(family, /analyticsSinceDate/);
  assert.match(tours, /centreCanAcceptInquiry/);
  assert.match(src("src/components/provider-trust.tsx"), /ProviderTrustChecklist/);
  assert.doesNotMatch(src("src/components/provider-trust.tsx"), /entitledPlan|inquiryCap/);
  assert.doesNotMatch(src("src/components/vacancy-confirm.tsx"), /entitledPlan|inquiryCap/);
});
