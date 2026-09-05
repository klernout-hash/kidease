import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import {
  parseProviderAddons,
  planPriceCad,
  PROVIDER_ADDONS,
  PROVIDER_CHECKOUT_LIVE,
  PROVIDER_PLANS,
  PROVIDER_SUBSCRIPTION_GHOST_MESSAGE,
  providerPlan,
  serializeProviderAddons,
} from "../src/lib/provider-plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("provider packages match the KidEase CAD one-pager", () => {
  const byId = Object.fromEntries(PROVIDER_PLANS.map((p) => [p.id, p]));
  assert.equal(byId.free.monthly, 0);
  assert.equal(byId.pro.monthly, 49);
  assert.equal(byId.pro.yearly, 490);
  assert.equal(byId.network.monthly, 39);
  assert.equal(byId.network.perSite, true);
  assert.equal(byId.network.minSites, 3);
  assert.equal(planPriceCad(byId.pro, "month"), 49);
  assert.equal(planPriceCad(byId.pro, "year"), 490);
  assert.equal(planPriceCad(byId.network, "month", 4), 156);
  const add = Object.fromEntries(PROVIDER_ADDONS.map((a) => [a.id, a]));
  assert.equal(add.featured_city.amount, 29);
  assert.equal(add.claim_boost.amount, 99);
  assert.equal(add.job_post.amount, 49);
  assert.equal(PROVIDER_CHECKOUT_LIVE, true);
  assert.equal(providerPlan("nope").id, "free");
});

test("addon parse keeps only known ids and a stable order", () => {
  assert.deepEqual(parseProviderAddons("job_post,featured_city,unknown"), [
    "featured_city",
    "job_post",
  ]);
  assert.equal(serializeProviderAddons(["job_post", "featured_city", "x"]), "featured_city,job_post");
});

test("Subscription nav is hidden unless the ghost/admin flag is on", () => {
  const hidden = visibleDeskNav("daycare", { providerSubscriptions: false }).map((i) => i.id);
  const shown = visibleDeskNav("daycare", { providerSubscriptions: true }).map((i) => i.id);
  assert.equal(hidden.includes("subscription"), false);
  assert.equal(shown.includes("subscription"), true);
  const item = visibleDeskNav("daycare", { providerSubscriptions: true }).find((i) => i.id === "subscription");
  assert.equal(item?.label, "Subscription");
  assert.equal(item?.icon, "credit-card");
  assert.equal(item?.href, "/provider/subscription");
  assert.equal(
    visibleDeskNav("parent", { providerSubscriptions: true }).some((i) => i.id === "subscription"),
    false,
  );
});

test("subscription route stays ghost-gated and checkout is live-keyed", () => {
  const route = src("src/routes/provider.subscription.tsx");
  const panel = src("src/components/provider-subscription.tsx");
  const server = src("src/lib/server/provider-subscriptions.ts");
  const tree = src("src/routeTree.gen.ts");
  const shell = src("src/components/desk-shell.tsx");
  assert.match(route, /createFileRoute\("\/provider\/subscription"\)/);
  assert.match(route, /session\?\.providerSubscriptions/);
  assert.match(route, /profiles\.role = admin/);
  assert.match(route, /FEATURE_PROVIDER_SUBSCRIPTIONS/);
  assert.match(route, /noindex/);
  assert.match(tree, /from '\.\/routes\/provider\.subscription'/);
  assert.match(tree, /id:\s*'\/provider\/subscription'/);
  assert.match(panel, /PROVIDER_SUBSCRIPTION_GHOST_MESSAGE/);
  assert.match(panel, /not parent Plus/);
  assert.match(panel, /startProviderCheckout/);
  assert.match(panel, /startProviderBillingPortal/);
  assert.match(panel, /Card payments are not live yet/);
  assert.match(server, /canSeeProviderSubscriptions/);
  assert.match(server, /selected_plan/);
  assert.match(server, /stripeChargesLive\(\)/);
  assert.match(server, /createCatalogCheckoutSession/);
  assert.doesNotMatch(server, /sk_live_[A-Za-z0-9]{8,}/);
  assert.match(shell, /visibleDeskNav/);
  assert.match(shell, /providerSubscriptions/);
  assert.equal(PROVIDER_SUBSCRIPTION_GHOST_MESSAGE.includes("Admin preview"), true);
});
