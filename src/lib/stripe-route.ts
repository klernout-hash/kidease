/**
 * A QA account (profiles.is_test) or a hidden centre always uses test keys.
 * A real parent at a public centre uses live keys only when KIDEASE_CONNECT_LIVE is exactly 1.
 * No secret values are stored here.
 */

export type PaymentStripeMode = "test" | "live";

export type StripeRouteEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_SECRET_KEY_TEST?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_PUBLISHABLE_KEY_TEST?: string;
};

export function flagOn(value: boolean | number | string | null | undefined): boolean {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true";
}

/**
 * Only the server-set profiles.is_test flag (reviewer seed, admin) puts a payer
 * on test keys. The account email is never used: anyone can sign up with any
 * address, unverified, and a test-mode payment must not settle a real bill.
 */
export function payerUsesTestStripe(input: { isTest?: boolean | number | string | null }): boolean {
  return flagOn(input.isTest);
}

/** Hidden, unpublished, or fixture centres. A public live centre is not included. */
export function centreUsesTestStripe(input: {
  visibility?: string | null;
  isTest?: boolean | number | string | null;
  isDemo?: boolean | number | string | null;
  slug?: string | null;
  id?: string | null;
}): boolean {
  if (flagOn(input.isTest) || flagOn(input.isDemo)) return true;
  if (String(input.visibility || "").trim() === "admin_only") return true;
  const slug = String(input.slug || "").trim().toLowerCase();
  const id = String(input.id || "").trim().toLowerCase();
  if (slug.startsWith("qa-") || slug.includes("qa-test") || slug.startsWith("ke-qa")) return true;
  if (id.startsWith("qa-") || id.startsWith("ke-qa") || id.startsWith("ke-test-")) return true;
  return false;
}

/**
 * QA payers and hidden centres stay on test keys even when live charges are on.
 * A real parent at a public centre is live. The live switch is checked by the
 * caller before a live secret is used.
 */
export function paymentStripeMode(input: {
  payerQa?: boolean;
  centreQa?: boolean;
  liveEnabled?: boolean;
}): PaymentStripeMode {
  if (input.payerQa || input.centreQa) return "test";
  if (input.liveEnabled === true) return "live";
  return "live";
}

export type StripeCredentials =
  | { ok: true; mode: PaymentStripeMode; secret: string; publishable: string }
  | { ok: false; mode: PaymentStripeMode; reason: "missing_test_key" | "missing_live_key" };

function clean(raw: string | undefined): string {
  return String(raw || "").trim();
}

/**
 * Test mode never returns a live secret. Live mode never returns a test secret.
 */
export function stripeCredentialsForMode(mode: PaymentStripeMode, env: StripeRouteEnv = process.env): StripeCredentials {
  const liveSecret = clean(env.STRIPE_SECRET_KEY);
  const testSecret = clean(env.STRIPE_SECRET_KEY_TEST);
  const livePublishable = clean(env.STRIPE_PUBLISHABLE_KEY);
  const testPublishable = clean(env.STRIPE_PUBLISHABLE_KEY_TEST);
  if (mode === "test") {
    const secret = testSecret.startsWith("sk_test_")
      ? testSecret
      : liveSecret.startsWith("sk_test_")
        ? liveSecret
        : "";
    const publishable = testPublishable.startsWith("pk_test_")
      ? testPublishable
      : livePublishable.startsWith("pk_test_")
        ? livePublishable
        : "";
    if (!secret || !publishable) return { ok: false, mode, reason: "missing_test_key" };
    return { ok: true, mode, secret, publishable };
  }
  if (!liveSecret.startsWith("sk_live_") || !livePublishable.startsWith("pk_live_")) {
    return { ok: false, mode, reason: "missing_live_key" };
  }
  return { ok: true, mode, secret: liveSecret, publishable: livePublishable };
}

/** A QA account or is_test centre must never be handed a live secret. */
export function qaLiveChargeBlocked(secret: string, qa: boolean): boolean {
  return qa && secret.trim().startsWith("sk_live_");
}

export type RoutedStripeCall =
  | { ok: true; mode: PaymentStripeMode; secret: string; publishable: string }
  | { ok: false; mode: PaymentStripeMode | null; reason: "off" | "live" | "missing" };

/**
 * One routing rule for every server call. A QA payer or a QA centre gets test
 * keys, and never a live secret. Everyone else is live, and live needs
 * KIDEASE_CONNECT_LIVE=1. The publishable key always matches the secret's mode,
 * so the browser and the server talk to the same Stripe mode.
 */
export function routeStripeCall(input: {
  paymentsEnabled: boolean;
  liveEnabled: boolean;
  payer?: { isTest?: boolean | number | string | null } | null;
  centre?: {
    id?: string | null;
    slug?: string | null;
    visibility?: string | null;
    isTest?: boolean | number | string | null;
    isDemo?: boolean | number | string | null;
  } | null;
  env?: StripeRouteEnv;
}): RoutedStripeCall {
  if (!input.paymentsEnabled) return { ok: false, mode: null, reason: "off" };
  const payerQa = payerUsesTestStripe({ isTest: input.payer?.isTest });
  const centreQa = input.centre ? centreUsesTestStripe(input.centre) : false;
  const qa = payerQa || centreQa;
  const mode: PaymentStripeMode = qa ? "test" : paymentStripeMode({ payerQa, centreQa, liveEnabled: input.liveEnabled });
  if (!qa && mode === "live" && !input.liveEnabled) return { ok: false, mode, reason: "live" };
  const creds = stripeCredentialsForMode(mode, input.env ?? process.env);
  if (!creds.ok) return { ok: false, mode, reason: "missing" };
  if (qaLiveChargeBlocked(creds.secret, qa)) return { ok: false, mode, reason: "missing" };
  return { ok: true, mode: creds.mode, secret: creds.secret, publishable: creds.publishable };
}
