/**
 * Behavioral auth / pay / IDOR suite (scorecard P1).
 *
 * Invokes the same decision helpers the claim, listing, checkout, and
 * requireUserId handlers use. Stripe is mocked — never api.stripe.com.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTH_FAIL_CLOSED,
  AUTH_UNAUTHORIZED,
  BILL_LEDGER_ONLY,
  BILL_NOT_OPEN,
  CLAIM_ALREADY_TAKEN,
  DEV_FALLBACK_USER_ID,
  LISTING_NOT_FOUND,
  LISTING_NOT_YOURS,
  NETWORK_MIN_SITES,
  PLUS_LEDGER_ONLY,
  PLUS_PRICE_MISSING,
  PROVIDER_LEDGER_ONLY,
  PROVIDER_PRICE_MISSING,
  accessDeniedMessage,
  assertCanMutateListing,
  canCallDeskWriteApi,
  canMutateListing,
  canReadChild,
  canWriteChild,
  canWriteOwnProfile,
  decideBillCheckout,
  decideParentPlusCheckout,
  decideProviderCheckout,
  decideStartClaim,
  evaluateSameSiteRequest,
  guestPathKind,
  resolveConnectDestination,
  resolveRequiredUserId,
} from "../src/lib/access-control.ts";
import {
  createStripeCheckoutSession,
  setStripeFetchForTests,
  stripeRequest,
} from "../src/lib/server/stripe-checkout.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const PARENT_A = "user-parent-a";
const PARENT_B = "user-parent-b";
const DAYCARE_A = "user-daycare-a";
const DAYCARE_B = "user-daycare-b";
const CENTRE_A = "dc-elm";
const CENTRE_B = "dc-oak";

afterEach(() => {
  setStripeFetchForTests(null);
  delete process.env.STRIPE_SECRET_KEY;
});

test("unauthenticated cannot open protected desks or admin APIs", () => {
  assert.equal(guestPathKind("/parent"), "sign_in");
  assert.equal(guestPathKind("/parent?tab=payments"), "sign_in");
  assert.equal(guestPathKind("/account"), "sign_in");
  assert.equal(guestPathKind("/inbox/c_1"), "sign_in");
  assert.equal(guestPathKind("/book/elm"), "sign_in");
  assert.equal(guestPathKind("/pay/bill/bl_1"), "sign_in");
  assert.equal(guestPathKind("/admin"), "sign_in");
  assert.equal(guestPathKind("/admin/queue"), "sign_in");
  assert.equal(guestPathKind("/admin-contracts"), "sign_in");
  assert.equal(guestPathKind("/support/sc_1"), "sign_in");
  assert.equal(guestPathKind("/verify-2fa"), "sign_in");
  assert.equal(guestPathKind("/provider/subscription"), "sign_in");
  assert.equal(guestPathKind("/api/admin/sentry-test"), "admin_api");
  assert.equal(guestPathKind("/api/admin/stripe-catalog"), "admin_api");
  assert.equal(guestPathKind("/provider"), "guest_landing");
  assert.equal(guestPathKind("/"), "public");
  assert.equal(guestPathKind("/login"), "public");
  assert.equal(guestPathKind("/delete-account"), "public");
  assert.equal(guestPathKind("/unsubscribe"), "public");
  assert.equal(guestPathKind("/claim"), "public");
  assert.equal(guestPathKind("/api/health"), "public");
  assert.equal(guestPathKind("/api/auth/sign-in/email"), "public");

  assert.deepEqual(resolveRequiredUserId({ authConfigured: true, databaseConfigured: true, sessionUserId: null }), {
    ok: false,
    code: "unauthorized",
    error: AUTH_UNAUTHORIZED,
  });
  assert.deepEqual(
    resolveRequiredUserId({ authConfigured: false, databaseConfigured: true, sessionUserId: null }),
    { ok: false, code: "fail_closed", error: AUTH_FAIL_CLOSED },
  );
  assert.deepEqual(
    resolveRequiredUserId({ authConfigured: false, databaseConfigured: false, sessionUserId: null }),
    { ok: true, userId: DEV_FALLBACK_USER_ID },
  );
  assert.deepEqual(
    resolveRequiredUserId({ authConfigured: true, databaseConfigured: true, sessionUserId: PARENT_A }),
    { ok: true, userId: PARENT_A },
  );
});

test("wrong desk cannot call other desk write APIs", () => {
  assert.equal(canCallDeskWriteApi({ actorRole: "parent", target: "admin" }), false);
  assert.equal(canCallDeskWriteApi({ actorRole: "provider", target: "admin" }), false);
  assert.equal(canCallDeskWriteApi({ actorRole: "support", target: "admin" }), false);
  assert.equal(canCallDeskWriteApi({ actorRole: "admin", target: "admin" }), true);

  assert.equal(canCallDeskWriteApi({ actorRole: "parent", target: "support" }), false);
  assert.equal(canCallDeskWriteApi({ actorRole: "provider", target: "support" }), false);
  assert.equal(canCallDeskWriteApi({ actorRole: "support", target: "support" }), true);

  assert.equal(
    canCallDeskWriteApi({
      actorRole: "parent",
      actorUserId: PARENT_A,
      target: "provider_listing",
      ownedDaycareIds: [],
      daycareId: CENTRE_A,
    }),
    false,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "provider",
      actorUserId: DAYCARE_B,
      target: "provider_listing",
      ownedDaycareIds: [CENTRE_B],
      daycareId: CENTRE_A,
    }),
    false,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "provider",
      actorUserId: DAYCARE_A,
      target: "provider_listing",
      ownedDaycareIds: [CENTRE_A],
      daycareId: CENTRE_A,
    }),
    true,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "parent",
      actorUserId: PARENT_A,
      target: "parent_child",
      resourceOwnerId: PARENT_B,
    }),
    false,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "provider",
      actorUserId: DAYCARE_A,
      target: "parent_pay",
      resourceOwnerId: PARENT_A,
    }),
    false,
  );
});

test("parent A cannot read or mutate parent B child or profile", () => {
  assert.equal(canReadChild(PARENT_A, PARENT_B), false);
  assert.equal(canWriteChild(PARENT_A, PARENT_B), false);
  assert.equal(canWriteOwnProfile(PARENT_A, PARENT_B), false);
  assert.equal(canReadChild(PARENT_A, PARENT_A), true);
  assert.equal(canWriteChild(PARENT_A, PARENT_A), true);
  assert.equal(canWriteOwnProfile(PARENT_A, PARENT_A), true);
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "parent",
      actorUserId: PARENT_A,
      target: "parent_profile",
      resourceOwnerId: PARENT_B,
    }),
    false,
  );
});

test("daycare A cannot mutate daycare B listing", () => {
  assert.equal(canMutateListing([CENTRE_A], CENTRE_B), false);
  assert.equal(canMutateListing([CENTRE_A], CENTRE_A), true);
  assert.equal(canMutateListing([], CENTRE_A), false);
  assert.throws(() => assertCanMutateListing([CENTRE_B], CENTRE_A), (err) => {
    assert.equal(err instanceof Error && err.message, LISTING_NOT_YOURS);
    return true;
  });
  assert.doesNotThrow(() => assertCanMutateListing([CENTRE_A], CENTRE_A));
});

test("startClaim rejects missing listings, ghosts, and another owner's centre", () => {
  assert.deepEqual(
    decideStartClaim({ actorUserId: DAYCARE_A, listingFound: false }),
    { ok: false, error: LISTING_NOT_FOUND },
  );
  assert.deepEqual(
    decideStartClaim({
      actorUserId: DAYCARE_A,
      listingFound: true,
      adminOnly: true,
      isAdmin: false,
    }),
    { ok: false, error: LISTING_NOT_FOUND },
  );
  assert.deepEqual(
    decideStartClaim({
      actorUserId: DAYCARE_A,
      existingOwnerUserId: DAYCARE_B,
      listingFound: true,
    }),
    { ok: false, error: CLAIM_ALREADY_TAKEN },
  );
  assert.deepEqual(
    decideStartClaim({
      actorUserId: DAYCARE_A,
      existingOwnerUserId: DAYCARE_A,
      listingFound: true,
    }),
    { ok: true, alreadyOwned: true },
  );
  assert.deepEqual(
    decideStartClaim({ actorUserId: DAYCARE_A, listingFound: true, existingOwnerUserId: null }),
    { ok: true, alreadyOwned: false },
  );
  assert.equal(
    decideStartClaim({
      actorUserId: "admin-1",
      listingFound: true,
      adminOnly: true,
      isAdmin: true,
    }).ok,
    true,
  );
});

test("bill checkout rejects unauthorized callers and invalid state before Stripe", () => {
  const sent = { parentUserId: PARENT_A, status: "sent" };
  assert.deepEqual(decideBillCheckout({ actorUserId: PARENT_A, bill: sent, stripeLive: false }), {
    ok: false,
    error: BILL_LEDGER_ONLY,
  });
  assert.deepEqual(decideBillCheckout({ actorUserId: null, bill: sent, stripeLive: true }), {
    ok: false,
    error: accessDeniedMessage("bill"),
  });
  assert.deepEqual(decideBillCheckout({ actorUserId: PARENT_B, bill: sent, stripeLive: true }), {
    ok: false,
    error: accessDeniedMessage("bill"),
  });
  assert.deepEqual(decideBillCheckout({ actorUserId: DAYCARE_A, bill: sent, stripeLive: true }), {
    ok: false,
    error: accessDeniedMessage("bill"),
  });
  assert.deepEqual(decideBillCheckout({ actorUserId: PARENT_A, bill: null, stripeLive: true }), {
    ok: false,
    error: accessDeniedMessage("bill"),
  });
  assert.deepEqual(
    decideBillCheckout({ actorUserId: PARENT_A, bill: { parentUserId: PARENT_A, status: "draft" }, stripeLive: true }),
    { ok: false, error: BILL_NOT_OPEN },
  );
  assert.deepEqual(
    decideBillCheckout({ actorUserId: PARENT_A, bill: { parentUserId: PARENT_A, status: "void" }, stripeLive: true }),
    { ok: false, error: BILL_NOT_OPEN },
  );
  assert.deepEqual(
    decideBillCheckout({ actorUserId: PARENT_A, bill: { parentUserId: PARENT_A, status: "paid" }, stripeLive: true }),
    { ok: true, alreadyPaid: true },
  );
  assert.deepEqual(decideBillCheckout({ actorUserId: PARENT_A, bill: sent, stripeLive: true }), {
    ok: true,
    alreadyPaid: false,
  });
});

test("Connect destination stays off until the centre account can charge", () => {
  assert.equal(resolveConnectDestination({ stripeAccountId: "acct_1", chargesEnabled: 0 }), null);
  assert.equal(resolveConnectDestination({ stripeAccountId: "acct_1", chargesEnabled: false }), null);
  assert.equal(resolveConnectDestination({ stripeAccountId: "", chargesEnabled: 1 }), null);
  assert.equal(resolveConnectDestination({ stripeAccountId: "acct_1", chargesEnabled: 1 }), "acct_1");
  assert.equal(resolveConnectDestination({ stripeAccountId: "acct_1", chargesEnabled: true }), "acct_1");
});

test("Plus and centre catalog checkout reject ledger / missing price / Network under 3 sites", () => {
  assert.deepEqual(decideParentPlusCheckout({ stripeLive: false, priceId: "price_plus" }), {
    ok: false,
    error: PLUS_LEDGER_ONLY,
  });
  assert.deepEqual(decideParentPlusCheckout({ stripeLive: true, priceId: "" }), {
    ok: false,
    error: PLUS_PRICE_MISSING,
  });
  assert.deepEqual(decideParentPlusCheckout({ stripeLive: true, priceId: "price_plus" }), { ok: true });

  assert.deepEqual(decideProviderCheckout({ plan: "free", stripeLive: false }), { ok: true, savedOnly: true });
  assert.deepEqual(decideProviderCheckout({ plan: "pro", stripeLive: false, priceId: "price_pro" }), {
    ok: false,
    error: PROVIDER_LEDGER_ONLY,
  });
  assert.deepEqual(decideProviderCheckout({ plan: "pro", stripeLive: true, priceId: null }), {
    ok: false,
    error: PROVIDER_PRICE_MISSING,
  });
  assert.deepEqual(
    decideProviderCheckout({ plan: "network", stripeLive: true, priceId: "price_net", siteCount: 2 }),
    { ok: false, error: NETWORK_MIN_SITES },
  );
  assert.deepEqual(
    decideProviderCheckout({ plan: "network", stripeLive: true, priceId: "price_net", siteCount: 3 }),
    { ok: true },
  );
});

test("scripted cross-site requests are blocked; same-origin and top-level GET are not", () => {
  assert.equal(evaluateSameSiteRequest({}), "allow");
  assert.equal(evaluateSameSiteRequest({ secFetchSite: "same-origin" }), "allow");
  assert.equal(evaluateSameSiteRequest({ secFetchSite: "none" }), "allow");
  assert.equal(
    evaluateSameSiteRequest({
      secFetchSite: "cross-site",
      secFetchMode: "navigate",
      secFetchDest: "document",
      method: "GET",
    }),
    "allow",
  );
  assert.equal(
    evaluateSameSiteRequest({
      secFetchSite: "same-site",
      secFetchMode: "cors",
      method: "POST",
    }),
    "block",
  );
  assert.equal(
    evaluateSameSiteRequest({
      secFetchSite: "cross-site",
      secFetchMode: "cors",
      method: "POST",
    }),
    "block",
  );
});

test("mocked Stripe checkout never calls api.stripe.com and refuses a missing secret", async () => {
  const hits = [];
  setStripeFetchForTests(async (input) => {
    hits.push(String(input));
    return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  await assert.rejects(() => stripeRequest("/checkout/sessions", { mode: "payment" }), /Stripe is not configured/);
  assert.equal(hits.length, 0);

  process.env.STRIPE_SECRET_KEY = "sk_test_mock_only";
  const session = await createStripeCheckoutSession({
    billId: "bl_1",
    number: "KE-202609-ABCD",
    amountCents: 120000,
    period: "2026-09",
    daycareName: "Elm",
    successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
    cancelUrl: "https://kidease.ca/pay/bill/bl_1",
  });
  assert.equal(session.id, "cs_test_1");
  assert.equal(session.url, "https://checkout.stripe.test/c/pay/cs_test_1");
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions$/);
  assert.doesNotMatch(hits[0], /stripe\.com\/c\/pay/);
});

test("handlers stay wired to the decision helpers (no silent IDOR regression)", () => {
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /decideStartClaim/);
  assert.match(claims, /assertCanMutateListing/);

  const family = src("src/lib/server/family.ts");
  assert.match(family, /assertCanMutateListing/);
  assert.match(family, /where id = \$\{data\.id\} and user_id = \$\{context\.userId\}/);
  assert.match(family, /from children where user_id = \$\{context\.userId\}/);

  const profile = src("src/lib/server/profile-contact.ts");
  assert.match(profile, /where user_id = \$\{context\.userId\}/);
  assert.match(profile, /where id = \$\{context\.userId\}/);

  const billing = src("src/lib/server/billing.ts");
  assert.match(billing, /decideBillCheckout/);
  assert.match(billing, /resolveConnectDestination/);

  assert.match(src("src/lib/server/parent-plus.ts"), /decideParentPlusCheckout/);
  assert.match(src("src/lib/server/provider-subscriptions.ts"), /decideProviderCheckout/);
  assert.match(src("src/lib/auth/verify.server.ts"), /resolveRequiredUserId/);
  assert.match(src("src/lib/auth/isolation.server.ts"), /evaluateSameSiteRequest/);
  assert.match(src("src/lib/server/waitlist-api.ts"), /assertCanMutateListing/);
  assert.match(src("src/lib/server/promos.ts"), /assertCanMutateListing/);
  assert.match(src("src/lib/server/trust.ts"), /assertCanMutateListing/);

  const parent = src("src/routes/parent.tsx");
  assert.match(parent, /RedirectToSignIn/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /providerGuestSignIn/);
  assert.match(src("src/routes/provider.subscription.tsx"), /RedirectToSignIn/);
  assert.match(src("src/routes/pay.bill.$billId.tsx"), /RedirectToSignIn/);
});
