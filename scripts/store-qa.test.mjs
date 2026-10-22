import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { comingSoonStores, STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";
import {
  createServerFnFetch,
  SERVER_FN_ATTEMPT_CAP,
  serverFnBackoffMs,
} from "../src/lib/server-fn-client.ts";
import { isStorePurchasePath, legalDocWithoutStorePurchase, mentionsStorePurchase } from "../src/lib/store-purchase-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("server function calls back off and stop after the cap", async () => {
  assert.equal(serverFnBackoffMs(1, null), 400);
  assert.equal(serverFnBackoffMs(2, null), 800);
  assert.equal(serverFnBackoffMs(1, "2"), 2000);
  let clock = 1_000;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("Too many requests", { status: 429, headers: { "retry-after": "0" } });
  };
  const gated = createServerFnFetch({
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  const first = await gated("/_serverFn/getDaycare", { method: "POST" });
  assert.equal(first.status, 429);
  assert.equal(calls, SERVER_FN_ATTEMPT_CAP);
  await assert.rejects(() => gated("/_serverFn/getDaycare", { method: "POST" }), /Too many requests/);
  assert.equal(calls, SERVER_FN_ATTEMPT_CAP);
  const other = await gated("/api/auth/sign-in", { method: "POST" });
  assert.equal(other.status, 429);
  assert.equal(calls, SERVER_FN_ATTEMPT_CAP + 1);
});

test("listing, turnstile, login, radius, contact, and the menu match the QA notes", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /isTransientListingError/);
  assert.match(listing, /listingRetry/);
  assert.match(listing, /data-ke=\{retrying \? "listing-retry"/);
  assert.match(listing, /md:hidden/);
  assert.match(listing, /md:grid-cols-/);
  assert.match(listing, /w-full whitespace-normal/);
  assert.match(src("src/lib/use-copy.ts"), /useCallback/);
  assert.match(src("src/client.tsx"), /installServerFnFetchGate/);
  const field = src("src/components/turnstile-field.tsx");
  assert.match(field, /size: "flexible"/);
  assert.match(field, /resolvedTheme/);
  assert.doesNotMatch(field, /overflow-x-hidden/);
  assert.match(src("scripts/csp.mjs"), /connect-src 'self' data:/);
  const login = src("src/routes/login.tsx");
  assert.match(login, /PASSWORD_CONTINUE_MESSAGE/);
  assert.match(login, /showAdminCopy = urlOperator && sessionEmail/);
  assert.match(login, /href="\/parent" className="[^"]*text-fg/);
  assert.doesNotMatch(login, /href="\/parent" className="[^"]*text-subtle/);
  const radius = src("src/components/explore-search-bar.tsx");
  assert.match(radius, /min-w-\[7\.5rem\]/);
  assert.doesNotMatch(radius, /max-w-\[4\.75rem\]/);
  const contact = src("src/routes/contact.tsx");
  assert.match(contact, /\/photos\/kitchen\.jpg/);
  assert.doesNotMatch(contact, /brick\.jpg/);
  const menuButton = src("src/components/shell.tsx");
  const drawer = menuButton.slice(menuButton.indexOf('aria-controls="ke-nav-drawer"'));
  assert.doesNotMatch(drawer.slice(0, 280), /onPointerDown/);
  assert.match(drawer.slice(0, 280), /onClick/);
});

test("store builds name only their store and drop purchase copy", () => {
  assert.deepEqual(STORE_PAYMENTS_ENABLED, {
    apple: false,
    google: false,
    microsoft: false,
    samsung: false,
    huawei: false,
  });
  assert.deepEqual(comingSoonStores("web"), ["apple", "play"]);
  assert.deepEqual(comingSoonStores("apple"), ["apple"]);
  assert.deepEqual(comingSoonStores("google"), ["play"]);
  assert.deepEqual(comingSoonStores("microsoft"), []);
  assert.deepEqual(comingSoonStores("samsung"), []);
  assert.deepEqual(comingSoonStores("huawei"), []);
  assert.equal(isStorePurchasePath("/donate"), true);
  assert.equal(isStorePurchasePath("/fr/plans"), true);
  assert.equal(isStorePurchasePath("/search"), false);
  assert.equal(mentionsStorePurchase("Pay with Apple Pay"), true);
  assert.equal(mentionsStorePurchase("Licensed centres in Canada"), false);
  const stripped = JSON.stringify(
    legalDocWithoutStorePurchase({
      kicker: "Privacy",
      title: "Privacy",
      updated: "2026",
      intro: ["Card, Apple Pay, and a deposit."],
      sections: [
        { id: "pay", title: "Deposits and refunds", blocks: [{ type: "p", text: "Interac later." }] },
        {
          id: "who",
          title: "Who we are",
          blocks: [
            { type: "p", text: "KidEase is a Canadian company." },
            { type: "p", text: "Stripe Checkout, Apple Pay, and Google Pay." },
            { type: "ul", items: ["Interac e-Transfer may be added.", "Search stays free."] },
            {
              type: "processors",
              items: [
                { name: "Stripe", purpose: "Apple Pay and a first-month deposit", href: "https://stripe.com/privacy" },
                { name: "Neon", purpose: "Postgres database for accounts.", href: "https://neon.tech/privacy-policy" },
              ],
            },
          ],
        },
      ],
      contactLead: "Email us",
    }),
  );
  assert.doesNotMatch(stripped, /Apple Pay|Google Pay|Interac|Stripe Checkout|deposit/i);
  assert.match(stripped, /Neon/);
  assert.match(stripped, /Canadian company/);
  assert.match(src("src/lib/legal-copy.ts"), /Apple Pay/);
  assert.match(src("src/routes/get-app.tsx"), /comingSoonStores/);
  assert.match(src("src/components/site-footer.tsx"), /comingSoonStores/);
  assert.match(src("src/routes/privacy.tsx"), /legalDocWithoutStorePurchase/);
  assert.match(src("src/routes/terms.tsx"), /legalDocWithoutStorePurchase/);
  assert.match(src("src/routes/fr.privacy.tsx"), /legalDocWithoutStorePurchase/);
  assert.match(src("src/routes/verify.tsx"), /hideCommerce \? \[\]/);
  assert.match(src("src/routes/menu.tsx"), /hideCommerce \? null : <MenuRow to=\{to\("\/donate"\)\}/);
  assert.match(src("src/lib/server/daycares.ts"), /async function loadFeatured[\s\S]*overlayFeaturedCity/);
  assert.match(src("src/components/daycare-card.tsx"), /SponsoredMark show=\{item\.featuredCity\}/);
  assert.match(src("src/components/listing-badges.tsx"), /SponsoredMark show=\{item\.featuredCity\}/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /SponsoredMark show=\{d\.featuredCity\}/);
});
