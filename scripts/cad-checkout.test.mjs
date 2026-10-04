import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPlanCad, yearlySavingsLine } from "../src/lib/upgrade-plans.ts";
import { planPriceHint, providerPlan } from "../src/lib/provider-plans.ts";
import { plusPriceHint } from "../src/lib/parent-plus.ts";
import { billingPriceLabel } from "../src/lib/subscription-lifecycle.ts";
import { STRIPE_CHECKOUT_LOCALES, checkoutCurrency, checkoutLocale } from "../src/lib/stripe-wallets.ts";
import { cadLookupPrice } from "../src/lib/stripe-price-mode.ts";
import {
  CHECKOUT_BILLING_COUNTRY,
  canadaCustomerParams,
  catalogCheckoutBody,
  checkoutSessionBody,
  createCatalogCheckoutSession,
  createStripeCheckoutSession,
  flattenStripeBody,
  setRememberStripeCustomerForTests,
  setStripeFetchForTests,
  stripeCustomerAddressIsSet,
} from "../src/lib/server/stripe-checkout.ts";

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("plan prices use a CA$ prefix in English and fr-CA dollars in French", () => {
  assert.equal(formatPlanCad(49, "en"), "CA$49");
  assert.equal(formatPlanCad(7.99, "en"), "CA$7.99");
  assert.equal(formatPlanCad(7.99, "fr"), "7,99\u00a0$");
  assert.equal(formatPlanCad(0, "en"), "CA$0");
  assert.equal(formatPlanCad(0, "fr"), "0\u00a0$");
  assert.equal(formatPlanCad(36.88, "en"), "CA$36.88");
  assert.equal(plusPriceHint("month", "en"), "CA$7.99/month");
  assert.equal(plusPriceHint("month", "fr"), "7,99\u00a0$/mois");
  assert.equal(plusPriceHint("year", "fr"), "59\u00a0$/an");
  assert.equal(planPriceHint(providerPlan("pro"), "month", "en"), "CA$49/month");
  assert.equal(planPriceHint(providerPlan("pro"), "year", "en"), "CA$490/year");
  assert.equal(planPriceHint(providerPlan("network"), "month", "fr"), "39\u00a0$/site/mois");
  assert.equal(planPriceHint(providerPlan("network"), "year", "en"), "CA$390/site/year");
  assert.equal(planPriceHint(providerPlan("free"), "month", "en"), "CA$0/month");
  assert.equal(planPriceHint(providerPlan("free"), "month", "fr"), "0\u00a0$/mois");
  assert.equal(billingPriceLabel({ product: "pro", interval: "year", locale: "en" }), "CA$490/year");
  assert.equal(billingPriceLabel({ product: "network", interval: "month", locale: "en" }), "CA$39/site/month");
  assert.equal(billingPriceLabel({ product: "plus", interval: "month", locale: "fr" }), "7,99\u00a0$/mois");
  assert.equal(billingPriceLabel({ product: "featured_city", interval: "month", locale: "en" }), "CA$29/month");
  assert.equal(yearlySavingsLine(49, 490, "en"), "or CA$490/year · save CA$98");
  assert.doesNotMatch(formatPlanCad(49, "en"), /^\$/);
});

test("checkout locale stays inside Stripe's allowlist", () => {
  const allowed = new Set(STRIPE_CHECKOUT_LOCALES);
  assert.equal(allowed.has("en"), true);
  assert.equal(allowed.has("fr-CA"), true);
  assert.equal(allowed.has("auto"), true);
  assert.equal(allowed.has("en-CA"), false);
  assert.equal(checkoutLocale("en"), "en");
  assert.equal(checkoutLocale("en-CA"), "en");
  assert.equal(checkoutLocale("fr"), "fr-CA");
  assert.equal(checkoutLocale(""), "auto");
  for (const sample of ["en", "en-GB", "EN", "fr", "fr-CA", "de", "es", "zh-HK", "", null]) {
    const value = checkoutLocale(sample);
    assert.equal(allowed.has(value), true, `${sample} -> ${value}`);
  }
});

test("checkout session params are Canada and CAD", () => {
  assert.equal(CHECKOUT_BILLING_COUNTRY, "CA");
  assert.equal(checkoutCurrency(""), "cad");
  assert.equal(checkoutCurrency("CAD"), "cad");
  assert.throws(() => checkoutCurrency("usd"), /Canadian dollars \(CAD\) only/);

  const customer = Object.fromEntries(flattenStripeBody(canadaCustomerParams({ email: "parent@example.com" })));
  assert.equal(customer["address[country]"], "CA");
  assert.equal(customer.email, "parent@example.com");

  const catalog = Object.fromEntries(
    flattenStripeBody(
      catalogCheckoutBody({
        mode: "subscription",
        priceId: "price_pro",
        successUrl: "https://kidease.ca/provider/subscription",
        cancelUrl: "https://kidease.ca/provider/subscription",
        customerId: "cus_ca",
        customerEmail: "should-not-send@example.com",
        locale: "fr",
        metadata: { kidease: "provider_sub" },
      }),
    ),
  );
  assert.equal(catalog.currency, "cad");
  assert.equal(catalog.customer, "cus_ca");
  assert.equal(catalog["customer_update[address]"], "auto");
  assert.equal(catalog.customer_email, undefined);
  assert.equal(catalog.locale, "fr-CA");
  assert.equal(catalog["payment_method_types[0]"], "card");

  const bill = Object.fromEntries(
    flattenStripeBody(
      checkoutSessionBody({
        billId: "bl_1",
        number: "KE-1",
        amountCents: 4900,
        currency: "cad",
        period: "2026-09",
        daycareName: "Elm",
        successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
        cancelUrl: "https://kidease.ca/pay/bill/bl_1",
        customerId: "cus_bill",
        locale: "en",
      }),
    ),
  );
  assert.equal(bill.currency, "cad");
  assert.equal(bill["line_items[0][price_data][currency]"], "cad");
  assert.equal(bill.customer, "cus_bill");
  assert.equal(bill["customer_update[address]"], "auto");
  assert.equal(bill.locale, "en");
});

test("lookup reuse rejects a non-CAD price", () => {
  assert.equal(cadLookupPrice({ id: "price_cad", currency: "CAD" }), "price_cad");
  assert.equal(cadLookupPrice(null), null);
  assert.throws(() => cadLookupPrice({ id: "price_usd", currency: "usd" }), /Canadian dollars \(CAD\) only/);
  assert.throws(() => cadLookupPrice({ id: "price_blank", currency: "" }), /Canadian dollars \(CAD\) only/);
});

test("an existing Stripe address is left unchanged", async () => {
  assert.equal(stripeCustomerAddressIsSet(null), false);
  assert.equal(stripeCustomerAddressIsSet({}), false);
  assert.equal(
    stripeCustomerAddressIsSet({ line1: "1 King St", city: "Toronto", postal_code: "M5V 1A1" }),
    true,
  );

  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_cad_only";
  /** @type {Array<{ url: string, method: string, body: string }>} */
  const calls = [];
  setStripeFetchForTests(async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    calls.push({ url, method, body: String(init?.body || "") });
    if (method === "GET" && url.includes("/customers/cus_full")) {
      return json({
        id: "cus_full",
        address: { country: "US", line1: "1 King St", city: "Toronto", state: "ON", postal_code: "M5V 1A1" },
      });
    }
    if (method === "GET" && url.includes("/customers/cus_street")) {
      return json({
        id: "cus_street",
        address: { country: "", line1: "9 Rue Peel", city: "Montreal", postal_code: "H3A 1T1" },
      });
    }
    if (method === "GET" && url.includes("/customers/cus_empty")) {
      return json({ id: "cus_empty", address: null });
    }
    if (method === "POST" && url.includes("/customers/")) return json({ id: "cus_empty" });
    return json({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
  });
  try {
    const sessionInput = {
      mode: "subscription",
      priceId: "price_pro",
      successUrl: "https://kidease.ca/provider/subscription",
      cancelUrl: "https://kidease.ca/provider/subscription",
      locale: "en",
      metadata: { kidease: "provider_sub" },
    };
    await createCatalogCheckoutSession({ ...sessionInput, customerId: "cus_full" });
    await createCatalogCheckoutSession({ ...sessionInput, customerId: "cus_street" });
    const kept = calls.filter((call) => call.method === "POST" && call.url.includes("/customers/cus_"));
    assert.deepEqual(kept, []);

    const before = calls.length;
    await createCatalogCheckoutSession({ ...sessionInput, customerId: "cus_empty" });
    const countryOnly = calls.slice(before).find((call) => call.method === "POST" && call.url.includes("/customers/cus_empty"));
    assert.ok(countryOnly);
    const posted = new URLSearchParams(countryOnly.body);
    assert.equal(posted.get("address[country]"), "CA");
    assert.equal(posted.get("address[line1]"), null);
    assert.equal(posted.get("address[city]"), null);
    assert.equal(posted.get("address[postal_code]"), null);
    assert.equal(posted.get("address[state]"), null);
  } finally {
    setStripeFetchForTests(null);
    if (previous == null) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test("creating a checkout session sets Canada on the customer and cad on the session", async () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_cad_only";
  /** @type {Array<{ url: string, method: string, body: string }>} */
  const calls = [];
  setStripeFetchForTests(async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    const body = String(init?.body || "");
    calls.push({ url, method, body });
    if (method === "GET" && url.includes("/customers/cus_us")) {
      return json({
        id: "cus_us",
        address: { country: "US", state: "ON", city: "Toronto", postal_code: "M5V 1A1", line1: "1 King St" },
      });
    }
    if (method === "GET" && url.includes("/customers/cus_ca")) {
      return json({ id: "cus_ca", address: { country: "CA", state: "QC", city: "Montreal" } });
    }
    if (method === "POST" && url.endsWith("/customers")) return json({ id: "cus_new" });
    if (method === "POST" && url.includes("/customers/")) return json({ id: "cus_us" });
    return json({ id: "cs_1", url: "https://checkout.stripe.test/cs_1", customer: "cus_us" });
  });
  try {
    await createCatalogCheckoutSession({
      mode: "subscription",
      priceId: "price_pro",
      successUrl: "https://kidease.ca/provider/subscription?checkout=success",
      cancelUrl: "https://kidease.ca/provider/subscription?checkout=cancel",
      customerId: "cus_us",
      locale: "fr",
      metadata: { kidease: "provider_sub", plan: "pro" },
    });
    assert.equal(
      calls.some((call) => call.method === "POST" && call.url.includes("/customers/cus_us")),
      false,
    );
    const session = calls.find((call) => call.url.endsWith("/checkout/sessions"));
    assert.ok(session);
    const posted = new URLSearchParams(session.body);
    assert.equal(posted.get("currency"), "cad");
    assert.equal(posted.get("customer"), "cus_us");
    assert.equal(posted.get("customer_update[address]"), "auto");
    assert.equal(posted.get("locale"), "fr-CA");
    assert.equal(posted.get("customer_email"), null);

    const before = calls.length;
    await createCatalogCheckoutSession({
      mode: "payment",
      priceId: "price_job",
      successUrl: "https://kidease.ca/provider/subscription",
      cancelUrl: "https://kidease.ca/provider/subscription",
      customerId: "cus_ca",
      locale: "en",
      metadata: { kidease: "addon" },
    });
    const extra = calls.slice(before);
    assert.equal(extra.some((call) => call.method === "POST" && call.url.includes("/customers/cus_ca")), false);
    const addon = extra.find((call) => call.url.endsWith("/checkout/sessions"));
    assert.equal(new URLSearchParams(addon.body).get("currency"), "cad");
    assert.equal(new URLSearchParams(addon.body).get("locale"), "en");

    const billBefore = calls.length;
    await createStripeCheckoutSession({
      billId: "bl_1",
      number: "KE-1",
      amountCents: 4900,
      currency: "cad",
      period: "2026-09",
      daycareName: "Elm",
      successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
      cancelUrl: "https://kidease.ca/pay/bill/bl_1",
      customerEmail: "parent@example.com",
      locale: "en",
    });
    const created = calls.slice(billBefore).find((call) => call.method === "POST" && call.url.endsWith("/customers"));
    assert.ok(created);
    assert.equal(new URLSearchParams(created.body).get("address[country]"), "CA");
    assert.equal(new URLSearchParams(created.body).get("email"), "parent@example.com");
    const billSession = calls.slice(billBefore).find((call) => call.url.endsWith("/checkout/sessions"));
    const billPosted = new URLSearchParams(billSession.body);
    assert.equal(billPosted.get("currency"), "cad");
    assert.equal(billPosted.get("customer"), "cus_new");
    assert.equal(billPosted.get("customer_update[address]"), "auto");
    assert.equal(
      billPosted.get("payment_intent_data[transfer_data][destination]"),
      null,
    );
  } finally {
    setStripeFetchForTests(null);
    if (previous == null) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test("a new Stripe customer is saved before Checkout, and a failed session still reuses it", async () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_cad_only";
  /** @type {Array<{ step: string, url?: string, userId?: string, customerId?: string }>} */
  const steps = [];
  let savedCustomerId = "";
  let failSession = true;
  setRememberStripeCustomerForTests(async (userId, customerId) => {
    savedCustomerId = customerId;
    steps.push({ step: "remember", userId, customerId });
  });
  setStripeFetchForTests(async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    steps.push({ step: method, url });
    if (method === "GET" && url.includes("/customers/cus_saved")) {
      return json({ id: "cus_saved", address: { country: "CA" } });
    }
    if (method === "POST" && url.endsWith("/customers")) return json({ id: "cus_saved" });
    if (url.endsWith("/checkout/sessions") && failSession) {
      failSession = false;
      return new Response(JSON.stringify({ error: { message: "session failed" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return json({ id: "cs_ok", url: "https://checkout.stripe.test/cs_ok", customer: "cus_saved" });
  });
  const sessionInput = {
    mode: "subscription",
    priceId: "price_plus",
    successUrl: "https://kidease.ca/parent",
    cancelUrl: "https://kidease.ca/parent",
    customerEmail: "parent@example.com",
    userId: "user_parent",
    locale: "en",
    metadata: { kidease: "parent_plus" },
  };
  try {
    await assert.rejects(() => createCatalogCheckoutSession(sessionInput), /session failed/);
    const remembered = steps.findIndex((step) => step.step === "remember");
    const created = steps.findIndex((step) => step.step === "POST" && step.url?.endsWith("/customers"));
    const failedSession = steps.findIndex((step) => step.step === "POST" && step.url?.endsWith("/checkout/sessions"));
    assert.ok(created >= 0 && remembered > created && failedSession > remembered);
    assert.equal(steps[remembered].userId, "user_parent");
    assert.equal(steps[remembered].customerId, "cus_saved");

    const beforeRetry = steps.length;
    const session = await createCatalogCheckoutSession({ ...sessionInput, customerId: savedCustomerId });
    assert.equal(session.id, "cs_ok");
    const retry = steps.slice(beforeRetry);
    assert.equal(
      retry.some((step) => step.step === "POST" && step.url?.endsWith("/customers")),
      false,
    );
    assert.equal(retry.filter((step) => step.step === "remember").length, 0);
  } finally {
    setStripeFetchForTests(null);
    setRememberStripeCustomerForTests(null);
    if (previous == null) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});
