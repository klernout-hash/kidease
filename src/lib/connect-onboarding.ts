/**
 * "Set up payouts" core. The server function wires real Stripe and database
 * calls into runConnectOnboarding; tests wire mocks. No package imports, so
 * node:test can load this file without node_modules.
 *
 * The browser must start Connect.js with the publishable key returned here,
 * because only this key matches the mode of the account session secret.
 */

import type { PaymentStripeMode, RoutedStripeCall } from "./stripe-route.ts";

export const CONNECT_ONBOARDING_SURFACE = "connect_onboarding";

export type ConnectOnboardingReason = "off" | "live" | "missing" | "not_owner" | "stripe_error";

export type ConnectOnboardingResult =
  | {
      ok: true;
      reason: null;
      clientSecret: string;
      publishableKey: string;
      mode: PaymentStripeMode;
      code: null;
    }
  | {
      ok: false;
      reason: ConnectOnboardingReason;
      clientSecret: null;
      publishableKey: null;
      mode: PaymentStripeMode | null;
      code: string | null;
    };

/** English line stored with the stripe_checkout_errors row (Admin reads it). */
export const CONNECT_ONBOARDING_PUBLIC: Record<ConnectOnboardingReason, string> = {
  off: "Payouts aren't turned on yet.",
  live: "Live payouts aren't turned on yet. We've been told.",
  missing: "Payouts setup isn't finished on our side. We've been told.",
  not_owner: "Only the centre owner can set up payouts.",
  stripe_error: "Stripe couldn't start setup. Try again, or contact support@kidease.ca.",
};

export type ConnectOnboardingMessageKey =
  | "connectErrOff"
  | "connectErrLive"
  | "connectErrMissing"
  | "connectErrNotOwner"
  | "connectErrStripe";

/** Copy key for each reason. connectErrStripe has a {code} slot. */
export function connectOnboardingMessageKey(reason: ConnectOnboardingReason | string | null | undefined): ConnectOnboardingMessageKey {
  switch (reason) {
    case "off":
      return "connectErrOff";
    case "live":
      return "connectErrLive";
    case "not_owner":
      return "connectErrNotOwner";
    case "stripe_error":
      return "connectErrStripe";
    default:
      return "connectErrMissing";
  }
}

/** Stripe error code (e.g. "account_invalid") or "unknown". Never the message text. */
export function stripeErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const bag = err as { code?: unknown; stripeCode?: unknown };
    for (const raw of [bag.stripeCode, bag.code]) {
      const code = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      if (/^[a-z0-9_]{1,60}$/.test(code)) return code;
    }
  }
  return "unknown";
}

function errorDetail(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "error";
  return String(err ?? "error");
}

export type ConnectOnboardingDeps = {
  userId: string;
  daycareId: string;
  ownsCentre: () => Promise<boolean>;
  route: () => Promise<RoutedStripeCall>;
  existingAccountId: () => Promise<string | null>;
  saveAccount: (accountId: string) => Promise<void>;
  /** POST to Stripe with the routed secret. */
  stripePost: <T>(path: string, body: Record<string, unknown>, opts: { idempotencyKey: string; secret: string }) => Promise<T>;
  accountBody: () => Record<string, unknown>;
  sessionBody: (accountId: string) => Record<string, unknown>;
  record: (input: { userId: string; surface: string; publicMessage: string; detail: string }) => Promise<void>;
  nonce: () => string;
};

function fail(reason: ConnectOnboardingReason, mode: PaymentStripeMode | null, code: string | null = null): ConnectOnboardingResult {
  return { ok: false, reason, clientSecret: null, publishableKey: null, mode, code };
}

export async function runConnectOnboarding(deps: ConnectOnboardingDeps): Promise<ConnectOnboardingResult> {
  const log = async (reason: ConnectOnboardingReason, detail: string) => {
    await deps
      .record({
        userId: deps.userId,
        surface: CONNECT_ONBOARDING_SURFACE,
        publicMessage: CONNECT_ONBOARDING_PUBLIC[reason],
        detail,
      })
      .catch(() => undefined);
  };

  if (!(await deps.ownsCentre())) {
    await log("not_owner", "not_owner");
    return fail("not_owner", null);
  }
  const routed = await deps.route();
  if (!routed.ok) {
    await log(routed.reason, `${routed.reason}${routed.mode ? ` (${routed.mode})` : ""}`);
    return fail(routed.reason, routed.mode);
  }

  try {
    let accountId = String((await deps.existingAccountId()) || "");
    if (!accountId.startsWith("acct_")) {
      const created = await deps.stripePost<{ id?: string }>("/accounts", deps.accountBody(), {
        idempotencyKey: `connect-acct-${routed.mode}-${deps.daycareId}`,
        secret: routed.secret,
      });
      accountId = String(created?.id || "");
      if (!accountId.startsWith("acct_")) {
        await log("stripe_error", "account create returned no id");
        return fail("stripe_error", routed.mode, "no_account");
      }
      await deps.saveAccount(accountId);
    }
    const session = await deps.stripePost<{ client_secret?: string }>("/account_sessions", deps.sessionBody(accountId), {
      idempotencyKey: `connect-session-${routed.mode}-${accountId}-${deps.nonce()}`,
      secret: routed.secret,
    });
    const clientSecret = String(session?.client_secret || "");
    if (!clientSecret) {
      await log("stripe_error", "account session returned no client secret");
      return fail("stripe_error", routed.mode, "no_client_secret");
    }
    return { ok: true, reason: null, clientSecret, publishableKey: routed.publishable, mode: routed.mode, code: null };
  } catch (err) {
    const code = stripeErrorCode(err);
    await log("stripe_error", `${code}: ${errorDetail(err)}`);
    return fail("stripe_error", routed.mode, code);
  }
}

/**
 * Connect.js asks for a client secret at start and again when a session
 * expires. Hand out the first secret once, then fetch a fresh one.
 */
export function firstSecretOnce(first: string, fetchFresh: () => Promise<string>): () => Promise<string> {
  let pending: string | null = first || null;
  return async () => {
    if (pending) {
      const secret = pending;
      pending = null;
      return secret;
    }
    return fetchFresh();
  };
}
