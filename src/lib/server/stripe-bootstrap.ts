import { stripeChargesLive } from "@/lib/stripe-live";
import {
  STRIPE_CATALOG,
  STRIPE_PRICE_ENV,
  amountToCents,
  envPriceId,
  maskStripeSecret,
  type StripeCatalogItem,
  type StripePriceKey,
} from "@/lib/server/stripe-catalog";
import { stripeRequest } from "@/lib/server/stripe-checkout";

type StripePrice = {
  id?: string;
  lookup_key?: string | null;
  unit_amount?: number | null;
  recurring?: { interval?: string } | null;
  product?: string | { id?: string } | null;
};

type StripeList<T> = { data?: T[] };

export type CatalogBootstrapRow = {
  key: StripePriceKey;
  envName: string;
  lookupKey: string;
  amountCad: number;
  required: boolean;
  envPriceId: string | null;
  createdPriceId: string | null;
  existingPriceId: string | null;
  action: "env" | "reused" | "created" | "missing";
};

export type CatalogBootstrapResult = {
  ok: true;
  live: boolean;
  secret: string;
  rows: CatalogBootstrapRow[];
  vercel: Record<string, string>;
};

async function findPriceByLookup(lookupKey: string): Promise<StripePrice | null> {
  const list = await stripeRequest<StripeList<StripePrice>>(
    "/prices",
    { "lookup_keys[0]": lookupKey, active: "true", limit: 1 },
    "GET",
  ).catch(() => ({ data: [] as StripePrice[] }));
  return list.data?.[0] ?? null;
}

async function createCatalogPrice(item: StripeCatalogItem): Promise<string> {
  const product = await stripeRequest<{ id?: string }>("/products", {
    name: item.productName,
    description: item.description,
    metadata: { kidease: "catalog", lookup_key: item.lookupKey },
  });
  if (!product.id) throw new Error(`Could not create Stripe product for ${item.key}`);
  const priceBody: Record<string, unknown> = {
    product: product.id,
    currency: "cad",
    unit_amount: amountToCents(item.amountCad),
    lookup_key: item.lookupKey,
    metadata: { kidease: "catalog", key: item.key },
    nickname: item.lookupKey,
  };
  if (item.kind === "recurring" && item.interval) {
    priceBody.recurring = { interval: item.interval };
  }
  const price = await stripeRequest<StripePrice>("/prices", priceBody);
  if (!price.id) throw new Error(`Could not create Stripe price for ${item.key}`);
  return price.id;
}

export async function bootstrapStripeCatalog(opts?: { createMissing?: boolean }): Promise<CatalogBootstrapResult> {
  const live = stripeChargesLive();
  const createMissing = Boolean(opts?.createMissing);
  if (createMissing && !live) {
    throw new Error("Catalog bootstrap only creates LIVE prices. Set STRIPE_SECRET_KEY to a sk_live_ key.");
  }
  const rows: CatalogBootstrapRow[] = [];
  const vercel: Record<string, string> = {};

  for (const item of STRIPE_CATALOG) {
    const existingEnv = envPriceId(item.key);
    let existingPriceId: string | null = null;
    let createdPriceId: string | null = null;
    let action: CatalogBootstrapRow["action"] = existingEnv ? "env" : "missing";

    if (!existingEnv && live) {
      const found = await findPriceByLookup(item.lookupKey);
      existingPriceId = found?.id ?? null;
      if (existingPriceId) action = "reused";
      else if (createMissing) {
        createdPriceId = await createCatalogPrice(item);
        action = "created";
      }
    }

    const resolved = existingEnv || createdPriceId || existingPriceId;
    if (resolved) vercel[STRIPE_PRICE_ENV[item.key]] = resolved;

    rows.push({
      key: item.key,
      envName: STRIPE_PRICE_ENV[item.key],
      lookupKey: item.lookupKey,
      amountCad: item.amountCad,
      required: item.required,
      envPriceId: existingEnv,
      createdPriceId,
      existingPriceId,
      action,
    });
  }

  return {
    ok: true,
    live,
    secret: maskStripeSecret(process.env.STRIPE_SECRET_KEY),
    rows,
    vercel,
  };
}
