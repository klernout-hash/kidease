/** User-facing checkout copy. Raw Stripe text stays in logs and Admin. */

export const CHECKOUT_COULD_NOT_START =
  "Checkout could not start. Nothing was charged. Try again in a moment.";

export const PORTAL_COULD_NOT_OPEN = "Billing could not open. Try again in a moment.";

const STRIPE_LEAK =
  /must provide|no such price|sk_live|sk_test|resource_missing|checkout\.sessions|subscription mode|`subscription`/i;

export class CheckoutUserError extends Error {
  readonly detail: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "CheckoutUserError";
    this.detail = detail || message;
  }
}

export class StripeApiError extends Error {
  readonly stripeMessage: string;
  readonly status: number;

  constructor(stripeMessage: string, status: number) {
    super(stripeMessage);
    this.name = "StripeApiError";
    this.stripeMessage = stripeMessage;
    this.status = status;
  }
}

export function redactStripeDetail(detail: string): string {
  return String(detail || "")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "sk_$1_…")
    .replace(/rk_(live|test)_[A-Za-z0-9]+/g, "rk_$1_…")
    .slice(0, 500);
}

export function mapCheckoutError(err: unknown, fallback = CHECKOUT_COULD_NOT_START): {
  publicMessage: string;
  detail: string;
  passthrough: boolean;
} {
  if (err instanceof CheckoutUserError) {
    return { publicMessage: err.message, detail: redactStripeDetail(err.detail), passthrough: false };
  }
  if (err instanceof StripeApiError) {
    return {
      publicMessage: fallback,
      detail: redactStripeDetail(err.stripeMessage || err.message),
      passthrough: false,
    };
  }
  const message = err instanceof Error ? err.message.trim() : "";
  if (message && STRIPE_LEAK.test(message)) {
    return { publicMessage: fallback, detail: redactStripeDetail(message), passthrough: false };
  }
  return { publicMessage: message || fallback, detail: redactStripeDetail(message || "unknown"), passthrough: true };
}

/** Last line of defence in the browser if a server message still looks like Stripe. */
export function publicPayMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message.trim() : "";
  if (!message || STRIPE_LEAK.test(message)) return fallback;
  return message;
}
