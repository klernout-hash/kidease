/**
 * Checkout mode follows the KidEase catalog, then the live Stripe price must match.
 * A one-time price is never started in subscription mode, and a monthly add-on is
 * never silently charged as a one-time payment.
 */

import { amountToCents, type StripeCatalogItem, type StripeCatalogKind } from "./server/stripe-catalog.ts";

export type StripePriceSnapshot = {
  id?: string | null;
  active?: boolean | null;
  type?: string | null;
  currency?: string | null;
  unit_amount?: number | null;
  recurring?: { interval?: string | null } | null;
};

export type CheckoutMode = "subscription" | "payment";

export type PriceModeOk = {
  ok: true;
  mode: CheckoutMode;
  kind: StripeCatalogKind;
  note: string;
};

export type PriceModeBad = {
  ok: false;
  mode: null;
  kind: StripeCatalogKind | "unknown";
  expected: StripeCatalogKind;
  actual: string;
  friendly: string;
  detail: string;
  note: string;
};

export type PriceModeResult = PriceModeOk | PriceModeBad;

export function checkoutModeForKind(kind: StripeCatalogKind): CheckoutMode {
  return kind === "recurring" ? "subscription" : "payment";
}

export function observedPriceKind(price: StripePriceSnapshot | null | undefined): StripeCatalogKind | "unknown" {
  if (!price) return "unknown";
  const type = String(price.type || "").trim().toLowerCase();
  if (type === "one_time") return "one_time";
  if (type === "recurring" || price.recurring?.interval) return "recurring";
  return "unknown";
}

function moneyCad(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "an unknown amount";
  const dollars = cents / 100;
  const text = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `$${text} CAD`;
}

function expectedPhrase(item: Pick<StripeCatalogItem, "kind" | "interval">): string {
  if (item.kind === "one_time") return "a one-time price";
  if (item.interval === "year") return "a yearly subscription price";
  return "a monthly subscription price";
}

export function checkCatalogPrice(
  item: Pick<StripeCatalogItem, "key" | "productName" | "kind" | "interval" | "amountCad">,
  price: StripePriceSnapshot | null | undefined,
): PriceModeResult {
  const name = item.productName.replace(/^KidEase /, "");
  const expected = item.kind;
  const expectedCents = amountToCents(item.amountCad);

  if (!price || !price.id) {
    const detail = `${item.key}: Stripe did not return a price`;
    return {
      ok: false,
      mode: null,
      kind: "unknown",
      expected,
      actual: "missing",
      friendly: `${name} could not be read from Stripe, so checkout did not start. Nothing was charged.`,
      detail,
      note: "Expected " + expectedPhrase(item) + ". Stripe did not return this price.",
    };
  }

  const kind = observedPriceKind(price);
  const interval = String(price.recurring?.interval || "").trim().toLowerCase();
  const actual =
    kind === "recurring" ? `recurring${interval ? ` ${interval}` : ""}` : kind === "one_time" ? "one-time" : "unknown";
  const currency = String(price.currency || "").trim().toLowerCase();

  if (price.active === false) {
    return {
      ok: false,
      mode: null,
      kind,
      expected,
      actual: "inactive",
      friendly: `${name} is not available to buy right now. Nothing was charged.`,
      detail: `${item.key}: price ${price.id} is inactive`,
      note: `Expected ${expectedPhrase(item)}. This Stripe price is inactive.`,
    };
  }

  if (currency && currency !== "cad") {
    return {
      ok: false,
      mode: null,
      kind,
      expected,
      actual: currency.toUpperCase(),
      friendly: `${name} must be charged in Canadian dollars. Checkout did not start. Nothing was charged.`,
      detail: `${item.key}: price ${price.id} currency is ${currency}`,
      note: `Expected CAD. Stripe price currency is ${currency.toUpperCase()}.`,
    };
  }

  if (!currency) {
    return {
      ok: false,
      mode: null,
      kind,
      expected,
      actual,
      friendly: `${name} could not be confirmed as Canadian dollars, so checkout did not start. Nothing was charged.`,
      detail: `${item.key}: price ${price.id} has no currency`,
      note: "Expected CAD. Stripe did not return a currency.",
    };
  }

  if (kind !== expected) {
    const friendly =
      expected === "recurring"
        ? `${name} is ${expectedPhrase(item).replace(/^a /, "")}. The price on file is a one-time charge, so checkout did not start. Nothing was charged.`
        : `${name} is a one-time charge. The price on file is a subscription, so checkout did not start. Nothing was charged.`;
    return {
      ok: false,
      mode: null,
      kind,
      expected,
      actual,
      friendly,
      detail: `${item.key}: expected ${expected}${item.interval ? ` ${item.interval}` : ""}, Stripe price ${price.id} is ${actual}`,
      note: `Expected ${expected === "recurring" ? "recurring" : "one-time"}${item.interval ? ` (${item.interval})` : ""}. Stripe price is ${actual}.`,
    };
  }

  if (expected === "recurring" && item.interval && interval !== item.interval) {
    return {
      ok: false,
      mode: null,
      kind,
      expected,
      actual,
      friendly: `${name} is billed ${item.interval === "year" ? "yearly" : "monthly"}. This Stripe price is on a different schedule, so checkout did not start. Nothing was charged.`,
      detail: `${item.key}: expected interval ${item.interval}, Stripe price ${price.id} is ${interval || "unset"}`,
      note: `Expected recurring (${item.interval}). Stripe price is ${actual}.`,
    };
  }

  if (price.unit_amount != null && price.unit_amount !== expectedCents) {
    return {
      ok: false,
      mode: null,
      kind,
      expected,
      actual: moneyCad(price.unit_amount),
      friendly: `${name} should be ${moneyCad(expectedCents)}. This Stripe price is a different amount, so checkout did not start. Nothing was charged.`,
      detail: `${item.key}: expected ${expectedCents} cents, Stripe price ${price.id} is ${price.unit_amount}`,
      note: `Expected ${moneyCad(expectedCents)}. Stripe price is ${moneyCad(price.unit_amount)}.`,
    };
  }

  const note = `Matches ${expected === "recurring" ? `recurring ${item.interval || interval || "month"}` : "one-time"}, ${moneyCad(expectedCents)}.`;
  return {
    ok: true,
    mode: checkoutModeForKind(expected),
    kind: expected,
    note,
  };
}
