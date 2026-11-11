/**
 * Real parents pay real centres on live Stripe.
 * A QA account or a hidden QA centre stays on test keys, so a test card
 * cannot become a real charge. No secret values are stored here.
 */

export type PaymentStripeMode = "test" | "live";

const QA_PAYER_EMAILS = new Set([
  "klernout45@gmail.com",
  "reviewer.parent@kidease.ca",
  "reviewer.daycare@kidease.ca",
  "reviewer-parent@kidease.ca",
  "reviewer-provider@kidease.ca",
]);

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

/** Reviewer mailboxes, the QA parent, and kyle+qa plus-addresses. */
export function payerUsesTestStripe(input: {
  email?: string | null;
  isTest?: boolean | number | string | null;
}): boolean {
  if (flagOn(input.isTest)) return true;
  const email = String(input.email || "").trim().toLowerCase();
  if (!email) return false;
  if (QA_PAYER_EMAILS.has(email)) return true;
  return /^kyle\+qa[a-z0-9-]*@kidease\.ca$/.test(email);
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

/** Either side being QA forces test mode. A real parent at a real centre is live. */
export function paymentStripeMode(input: { payerQa?: boolean; centreQa?: boolean }): PaymentStripeMode {
  if (input.payerQa || input.centreQa) return "test";
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
export function stripeCredentialsForMode(mode: PaymentStripeMode, env: StripeRouteEnv = {}): StripeCredentials {
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
