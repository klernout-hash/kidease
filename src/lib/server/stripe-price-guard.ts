import { STRIPE_CATALOG, envPriceId, type StripePriceKey } from "@/lib/server/stripe-catalog";
import { stripeRequest } from "@/lib/server/stripe-checkout";
import { checkCatalogPrice, type StripePriceSnapshot } from "@/lib/stripe-price-mode";
import { CheckoutUserError } from "@/lib/stripe-public-error";

export async function requireCatalogCheckout(key: StripePriceKey): Promise<{
  priceId: string;
  mode: "subscription" | "payment";
}> {
  const item = STRIPE_CATALOG.find((row) => row.key === key);
  const priceId = envPriceId(key);
  if (!item || !priceId) {
    throw new Error("This Stripe price ID is not set. Add it on Vercel, then try again.");
  }
  let snapshot: StripePriceSnapshot | null = null;
  try {
    snapshot = await stripeRequest<StripePriceSnapshot>(`/prices/${encodeURIComponent(priceId)}`, {}, "GET");
  } catch (err) {
    const detail = err instanceof Error ? err.message : "price retrieve failed";
    const name = item.productName.replace(/^KidEase /, "");
    throw new CheckoutUserError(
      `${name} could not be read from Stripe, so checkout did not start. Nothing was charged.`,
      detail,
    );
  }
  const check = checkCatalogPrice(item, snapshot);
  if (!check.ok) throw new CheckoutUserError(check.friendly, check.detail);
  return { priceId, mode: check.mode };
}
