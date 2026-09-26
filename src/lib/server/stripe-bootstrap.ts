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
import { checkCatalogPrice, type StripePriceSnapshot } from "@/lib/stripe-price-mode";
import { redactStripeDetail } from "@/lib/stripe-public-error";
import { recentStripeCheckoutErrors, type StripeCheckoutErrorRow } from "@/lib/server/stripe-checkout-log";

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
  expectedKind: "recurring" | "one_time";
  expectedInterval: "month" | "year" | null;
  priceOk: boolean | null;
  priceNote: string;
  proposal: boolean;
  liveUnitAmountCents: number | null;
};

export type CatalogBootstrapResult = {
  ok: true;
  live: boolean;
  secret: string;
  rows: CatalogBootstrapRow[];
  vercel: Record<string, string>;
  recentErrors: StripeCheckoutErrorRow[];
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
      else if (createMissing && !item.proposal) {
        createdPriceId = await createCatalogPrice(item);
        action = "created";
      }
    }

    const resolved = existingEnv || createdPriceId || existingPriceId;
    if (resolved) vercel[STRIPE_PRICE_ENV[item.key]] = resolved;

    let priceOk: boolean | null = null;
    let priceNote = "";
    let liveUnitAmountCents: number | null = null;
    if (!live) {
      priceNote = item.proposal
        ? "Proposal. Not checked — Stripe live key is off. This price is not created until Kyle approves it."
        : "Not checked — Stripe live key is off.";
    } else if (!existingEnv) {
      priceNote = item.proposal
        ? "Proposal. Missing price ID. This tier stays hidden until Kyle sets the env var. Check prices does not create proposal prices."
        : "Missing price ID. Checkout for this price stays off.";
    } else {
      try {
        const snapshot = await stripeRequest<StripePriceSnapshot>(
          `/prices/${encodeURIComponent(existingEnv)}`,
          {},
          "GET",
        );
        if (typeof snapshot.unit_amount === "number") liveUnitAmountCents = snapshot.unit_amount;
        const check = checkCatalogPrice(item, snapshot);
        priceOk = check.ok;
        priceNote = check.note;
      } catch (err) {
        priceOk = false;
        const detail = redactStripeDetail(err instanceof Error ? err.message : "Could not read this price");
        priceNote = `Could not read this price from Stripe. ${detail}`.slice(0, 240);
      }
    }

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
      expectedKind: item.kind,
      expectedInterval: item.interval ?? null,
      priceOk,
      priceNote,
      proposal: Boolean(item.proposal),
      liveUnitAmountCents,
    });
  }

  return {
    ok: true,
    live,
    secret: maskStripeSecret(process.env.STRIPE_SECRET_KEY),
    rows,
    vercel,
    recentErrors: await recentStripeCheckoutErrors(),
  };
}
