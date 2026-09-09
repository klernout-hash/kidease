import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assertPayCheckoutAllowed,
  canUsePayCheckout,
  PLANS_NOT_OFFERED_YET,
  showPayCtas,
} from "../src/lib/features.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { listingMailtoHref, listingShareUrl } from "../src/lib/share.ts";
import { listingJsonLd, listingSeoMeta } from "../src/lib/listing-seo.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("SHOW_PAY_CTAS defaults off and SHOW_PAY_CTAS=1 restores", () => {
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(showPayCtas({}), false);
  assert.equal(showPayCtas({ SHOW_PAY_CTAS: "0" }), false);
  assert.equal(showPayCtas({ SHOW_PAY_CTAS: "1" }), true);
  assert.equal(canUsePayCheckout("parent"), false);
  assert.equal(canUsePayCheckout("provider"), false);
  assert.equal(canUsePayCheckout("admin"), true);
  assert.equal(canUsePayCheckout("parent", { SHOW_PAY_CTAS: "1" }), true);
  assert.throws(() => assertPayCheckoutAllowed("provider"), /Plans are not offered/);
  assert.doesNotThrow(() => assertPayCheckoutAllowed("admin"));
  assert.equal(
    PLANS_NOT_OFFERED_YET,
    "Plans are not offered on this site yet. Listing and claim stay free.",
  );
});

test("env example keeps Stripe and turns pay chrome off", () => {
  const envExample = src(".env.example");
  assert.match(envExample, /^SHOW_PAY_CTAS=0$/m);
  assert.match(envExample, /^FEATURE_PROVIDER_SUBSCRIPTIONS=1$/m);
  assert.match(envExample, /^FEATURE_SMS=0$/m);
  assert.match(envExample, /^FEATURE_PUSH=0$/m);
  assert.match(envExample, /^FEATURE_VIDEO=0$/m);
  assert.match(envExample, /^FEATURE_INAPP_CHAT=0$/m);
  assert.doesNotMatch(envExample, /^SHOW_PAY_CTAS=1$/m);
});

test("Stripe plan files stay; UI gates hide checkout", () => {
  for (const rel of [
    "src/lib/stripe-live.ts",
    "src/lib/provider-plans.ts",
    "src/lib/server/stripe-checkout.ts",
    "src/lib/server/stripe-lifecycle.ts",
    "src/routes/api/stripe.webhook.ts",
  ]) {
    assert.match(src(rel), /stripe|Stripe|checkout/i);
  }
  assert.match(src("src/lib/parent-plus.ts"), /PLUS_MONTHLY_CAD/);
  const panel = src("src/components/provider-subscription.tsx");
  assert.match(panel, /useShowPayCtas/);
  assert.match(panel, /plansNotOffered|PLANS_NOT_OFFERED_YET/);
  assert.match(panel, /startProviderCheckout/);
  const plus = src("src/components/parent-plus.tsx");
  assert.match(plus, /useShowPayCtas/);
  assert.match(plus, /startParentPlusCheckout/);
  const checkout = src("src/lib/server/provider-subscriptions.ts");
  assert.match(checkout, /assertPayCheckoutAllowed/);
  const plusServer = src("src/lib/server/parent-plus.ts");
  assert.match(plusServer, /assertPayCheckoutAllowed/);
});

test("public and desk chrome hide Upgrade / Subscribe unless flagged", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /PayCtas/);
  assert.match(provider, /FreePageExplainer/);
  assert.match(provider, /plansNotOffered/);
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /PayCtas/);
  assert.match(parent, /ParentPlusPanel/);
  const video = src("src/routes/video.$roomId.tsx");
  assert.match(video, /PayCtas/);
  assert.match(video, /parentPlusSubscribe/);
  const nav = visibleDeskNav("daycare", { providerSubscriptions: true, showPayCtas: false }).map((i) => i.id);
  assert.equal(nav.includes("promote"), false);
  assert.equal(nav.includes("subscription"), true);
  const on = visibleDeskNav("daycare", { providerSubscriptions: true, showPayCtas: true }).map((i) => i.id);
  assert.equal(on.includes("promote"), true);
});

test("free landing page keeps claim free and never invents $10-a-day fees", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /freeListingNotAd/);
  assert.match(listing, /photoPending/);
  assert.match(listing, /claimThisFreePage/);
  assert.match(listing, /parentRequestNotLive/);
  assert.match(listing, /FreeListingShareActions/);
  assert.match(listing, /listingJsonLdScript/);
  assert.doesNotMatch(listing, /\$49/);
  assert.doesNotMatch(listing, /\$7\.99/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /freeListingNotAd: "Free KidEase listing · not a paid ad"/);
  assert.match(copy, /claimThisFreePage: "Claim this free page"/);
  assert.match(copy, /plansNotOffered: "Plans are not offered on this site yet/);
  const claim = src("src/routes/claim.tsx");
  assert.match(claim, /claimed: true/);
  const explainer = src("src/components/free-listing-share.tsx");
  assert.match(explainer, /does not auto-post|freePageShareHint/);
  assert.match(explainer, /listingMailtoHref/);
});

test("JSON-LD and OG stay LocalBusiness/ChildCare without KidEase plan prices", () => {
  const centre = {
    slug: "sunny-side-child-care",
    name: "Sunny Side Child Care",
    city: "Winnipeg",
    province: "MB",
    address: "123 Main St",
    postalCode: "R3C 1A1",
    photos: ["/photos/buildings/mb-1.jpg"],
  };
  const json = listingJsonLd(centre);
  assert.deepEqual(json["@type"], ["ChildCare", "LocalBusiness"]);
  const text = JSON.stringify(json);
  assert.doesNotMatch(text, /\$49/);
  assert.doesNotMatch(text, /Parent Plus/);
  const meta = listingSeoMeta(centre);
  assert.ok(meta);
  assert.equal(meta.ogTitle.includes("KidEase"), true);
  assert.doesNotMatch(meta.ogDescription, /\$49/);
  assert.match(meta.ogImage, /https:\/\/www\.kidease\.ca\//);
  assert.equal(listingShareUrl("sunny-side-child-care"), "https://www.kidease.ca/daycare/sunny-side-child-care");
  const mail = listingMailtoHref({
    name: "Sunny Side Child Care",
    slug: "sunny-side-child-care",
    note: "Free KidEase listing · not a paid ad",
  });
  assert.match(mail, /^mailto:\?subject=/);
  assert.match(mail, /sunny-side-child-care/);
  assert.match(mail, /not%20a%20paid%20ad|not a paid ad|Free%20KidEase/);
});

test("master 23927 stays; no US rows invented in this change", () => {
  const stats = JSON.parse(src("src/lib/data/catalog-stats.json"));
  assert.equal(stats.masterRows, 23927);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.doesNotMatch(listing, /United States|US-only/);
});
