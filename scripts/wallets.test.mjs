import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkoutCurrency,
  checkoutLocale,
  checkoutPaymentMethodTypes,
  CHECKOUT_WALLET_PAYMENT_METHOD_TYPES,
  PAYMENT_ELEMENT_WALLET_OPTIONS,
} from "../src/lib/stripe-wallets.ts";
import { detectBrowserWallets, visibleWalletLabels } from "../src/lib/wallets.ts";
import { checkoutSessionBody, catalogCheckoutBody, flattenStripeBody } from "../src/lib/server/stripe-checkout.ts";
import {
  APPLE_PAY_DOMAIN_ASSOCIATION_PATH,
  applePayDomainAssociationPayload,
  isApplePayDomainAssociationPath,
  resolveApplePayDomainAssociation,
} from "./well-known-apple-pay.mjs";
import { wellKnownStaticPayload } from "./well-known-app-links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Checkout asks for card so Apple Pay / Google Pay can render — never those types", () => {
  assert.deepEqual(CHECKOUT_WALLET_PAYMENT_METHOD_TYPES, ["card"]);
  assert.deepEqual(checkoutPaymentMethodTypes(), ["card"]);
  assert.equal(PAYMENT_ELEMENT_WALLET_OPTIONS.applePay, "auto");
  assert.equal(PAYMENT_ELEMENT_WALLET_OPTIONS.googlePay, "auto");
  assert.equal(checkoutCurrency(""), "cad");
  assert.equal(checkoutCurrency("CAD"), "cad");
  assert.equal(checkoutLocale("fr"), "fr-CA");
  assert.equal(checkoutLocale("en-CA"), "en-CA");
  assert.equal(checkoutLocale(""), "auto");
});

test("bill and catalog Checkout sessions are CAD card wallets with locale", () => {
  const bill = checkoutSessionBody({
    billId: "bl_1",
    number: "KE-202609-ABCD",
    amountCents: 120000,
    period: "2026-09",
    daycareName: "Elm Daycare",
    successUrl: "https://kidease.ca/pay/bill/bl_1?paid=1",
    cancelUrl: "https://kidease.ca/pay/bill/bl_1",
    locale: "fr",
  });
  const flat = Object.fromEntries(flattenStripeBody(bill));
  assert.equal(flat["payment_method_types[0]"], "card");
  assert.equal(flat["line_items[0][price_data][currency]"], "cad");
  assert.equal(flat.locale, "fr-CA");
  assert.equal(flat["payment_method_types[1]"], undefined);

  const catalog = catalogCheckoutBody({
    mode: "subscription",
    priceId: "price_plus",
    successUrl: "https://kidease.ca/parent",
    cancelUrl: "https://kidease.ca/parent",
    metadata: { kidease: "parent_plus" },
    locale: "en",
  });
  const cflat = Object.fromEntries(flattenStripeBody(catalog));
  assert.equal(cflat["payment_method_types[0]"], "card");
  assert.equal(cflat.locale, "en-CA");
});

test("browser wallet detection is honest about Capacitor and Safari vs Chrome", () => {
  const safari = detectBrowserWallets({
    native: false,
    platform: "web",
    applePayCapable: true,
    paymentRequest: true,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  });
  assert.equal(safari.applePay, true);
  assert.equal(safari.googlePay, false);
  assert.equal(safari.nativeWebView, false);
  assert.deepEqual(visibleWalletLabels(safari), ["card", "apple"]);

  const chrome = detectBrowserWallets({
    native: false,
    platform: "web",
    applePayCapable: false,
    paymentRequest: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });
  assert.equal(chrome.applePay, false);
  assert.equal(chrome.googlePay, true);
  assert.deepEqual(visibleWalletLabels(chrome), ["card", "google"]);

  const nativeIos = detectBrowserWallets({
    native: true,
    platform: "ios",
    applePayCapable: true,
    paymentRequest: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  });
  assert.equal(nativeIos.applePay, false);
  assert.equal(nativeIos.googlePay, false);
  assert.equal(nativeIos.nativeWebView, true);
  assert.deepEqual(visibleWalletLabels(nativeIos), ["card"]);
});

test("Apple Pay domain association is env-only and never invented in git", () => {
  assert.equal(APPLE_PAY_DOMAIN_ASSOCIATION_PATH, "/.well-known/apple-developer-merchantid-domain-association");
  assert.equal(isApplePayDomainAssociationPath(APPLE_PAY_DOMAIN_ASSOCIATION_PATH), true);
  assert.equal(isApplePayDomainAssociationPath(`${APPLE_PAY_DOMAIN_ASSOCIATION_PATH}/`), true);
  assert.equal(isApplePayDomainAssociationPath("/.well-known/apple-app-site-association"), false);
  assert.equal(resolveApplePayDomainAssociation({}), null);
  assert.equal(applePayDomainAssociationPayload(APPLE_PAY_DOMAIN_ASSOCIATION_PATH, {}), null);
  assert.equal(wellKnownStaticPayload(APPLE_PAY_DOMAIN_ASSOCIATION_PATH, {}), null);

  const served = applePayDomainAssociationPayload(APPLE_PAY_DOMAIN_ASSOCIATION_PATH, {
    STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION: "  apple-pay-association-token  ",
  });
  assert.ok(served);
  assert.match(served.body, /apple-pay-association-token/);
  assert.match(served.contentType, /text\/plain/);
  assert.equal(
    wellKnownStaticPayload(APPLE_PAY_DOMAIN_ASSOCIATION_PATH, {
      STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION: "apple-pay-association-token",
    })?.body.includes("apple-pay-association-token"),
    true,
  );

  assert.equal(existsSync(join(root, "public/.well-known/apple-developer-merchantid-domain-association")), false);
  assert.doesNotMatch(src(".env.example"), /sk_live_[A-Za-z0-9]{8,}/);
  assert.match(src(".env.example"), /STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION=/);
});

test("Pay bill and catalog checkout open Stripe in the system browser on native", () => {
  const billPay = src("src/routes/pay.bill.$billId.tsx");
  assert.match(billPay, /openStripeCheckout/);
  assert.match(billPay, /WalletMethodHints/);
  assert.match(billPay, /payCadNote/);
  assert.doesNotMatch(billPay, /window\.location\.assign\(res\.url\)/);

  assert.match(src("src/components/parent-plus.tsx"), /openStripeCheckout/);
  assert.match(src("src/components/provider-subscription.tsx"), /openStripeCheckout/);
  assert.match(src("src/lib/wallets.ts"), /@capacitor\/browser/);
  assert.match(src("src/lib/wallets.ts"), /Browser\.open/);

  const copy = src("src/lib/copy.ts");
  assert.match(copy, /payWalletsNative/);
  assert.match(copy, /payWalletsUnavailable/);
  assert.match(copy, /Canadian dollars \(CAD\)/);
  assert.match(copy, /dollars canadiens \(CAD\)/);
});
