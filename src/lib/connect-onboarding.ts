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
export function connectOnboardingMessageKey(
  reason: ConnectOnboardingReason | string | null | undefined,
): ConnectOnboardingMessageKey {
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

/**
 * A short machine code for the UI and logs. Tries Stripe's code, then the
 * param it rejected, then the error type, then the HTTP status. Returns
 * "unknown" only when none of those exist. Never the message text.
 */
export function stripeErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const bag = err as {
      code?: unknown;
      stripeCode?: unknown;
      param?: unknown;
      type?: unknown;
      status?: unknown;
    };
    for (const raw of [bag.stripeCode, bag.code, bag.param, bag.type]) {
      const code = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const token = /^[a-z0-9_.[\]]{1,60}$/.test(code) ? normaliseStripeToken(code) : "";
      if (token) return token;
    }
    const status = typeof bag.status === "number" ? bag.status : Number.NaN;
    if (Number.isInteger(status) && status >= 100 && status <= 599) return `http_${status}`;
  }
  return "unknown";
}

/** controller[losses][payments] -> controller_losses_payments */
function normaliseStripeToken(code: string): string {
  return code
    .replace(/[.[\]]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
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
  stripePost: <T>(
    path: string,
    body: Record<string, unknown>,
    opts: { idempotencyKey: string; secret: string },
  ) => Promise<T>;
  accountBody: () => Record<string, unknown>;
  sessionBody: (accountId: string) => Record<string, unknown>;
  record: (input: {
    userId: string;
    surface: string;
    publicMessage: string;
    detail: string;
  }) => Promise<void>;
  nonce: () => string;
  /**
   * Find a connected account Stripe already made for this centre (matched on
   * metadata.kidease_daycare_id) that we never saved. Optional; used before a
   * fresh-key retry so a retry can never create a second account.
   */
  findAccountForCentre?: () => Promise<string | null>;
};

/** Small, stable, dependency-free hash (FNV-1a 32-bit) of a request body. */
export function stableBodyHash(body: unknown): string {
  const text = stableJson(body);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Idempotency key for creating a centre's connected account. It includes a
 * hash of the request body, so a body change (as on Nov 25, when the
 * controller settings changed) gets a new key instead of Stripe's
 * idempotency_error, while a double click with the same body still reuses
 * the same key and cannot make two accounts.
 */
export function connectAccountIdempotencyKey(
  mode: string,
  daycareId: string,
  body: Record<string, unknown>,
): string {
  return `connect-acct-${mode}-${daycareId}-${stableBodyHash(body)}`;
}

export function isIdempotencyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const bag = err as { code?: unknown; type?: unknown };
  return bag.code === "idempotency_error" || bag.type === "idempotency_error";
}

function stripeRequestIdOf(err: unknown): string {
  const id = err && typeof err === "object" ? (err as { requestId?: unknown }).requestId : null;
  return typeof id === "string" && id ? ` [${id}]` : "";
}

function fail(
  reason: ConnectOnboardingReason,
  mode: PaymentStripeMode | null,
  code: string | null = null,
): ConnectOnboardingResult {
  return { ok: false, reason, clientSecret: null, publishableKey: null, mode, code };
}

export async function runConnectOnboarding(
  deps: ConnectOnboardingDeps,
): Promise<ConnectOnboardingResult> {
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
    if (!accountId.startsWith("acct_") && deps.findAccountForCentre) {
      // Stripe made one earlier but the save failed: reuse it.
      accountId = String((await deps.findAccountForCentre().catch(() => null)) || "");
      if (accountId.startsWith("acct_")) await deps.saveAccount(accountId);
    }
    if (!accountId.startsWith("acct_")) {
      const body = deps.accountBody();
      const key = connectAccountIdempotencyKey(routed.mode, deps.daycareId, body);
      let created: { id?: string } | null = null;
      try {
        created = await deps.stripePost<{ id?: string }>("/accounts", body, {
          idempotencyKey: key,
          secret: routed.secret,
        });
      } catch (err) {
        // The key was used before with other params (or Stripe cached an
        // earlier failure). Reuse an account if one exists, else retry once
        // with a fresh key. Never loop.
        if (!isIdempotencyError(err)) throw err;
        await log(
          "stripe_error",
          `idempotency_error on ${key}; retrying with a fresh key${stripeRequestIdOf(err)}`,
        );
        const found = deps.findAccountForCentre
          ? String((await deps.findAccountForCentre().catch(() => null)) || "")
          : "";
        if (found.startsWith("acct_")) {
          created = { id: found };
        } else {
          created = await deps.stripePost<{ id?: string }>("/accounts", body, {
            idempotencyKey: `${key}-r${deps.nonce()}`,
            secret: routed.secret,
          });
        }
      }
      accountId = String(created?.id || "");
      if (!accountId.startsWith("acct_")) {
        await log("stripe_error", "account create returned no id");
        return fail("stripe_error", routed.mode, "no_account");
      }
      await deps.saveAccount(accountId);
    }
    const session = await deps.stripePost<{ client_secret?: string }>(
      "/account_sessions",
      deps.sessionBody(accountId),
      {
        idempotencyKey: `connect-session-${routed.mode}-${accountId}-${deps.nonce()}`,
        secret: routed.secret,
      },
    );
    const clientSecret = String(session?.client_secret || "");
    if (!clientSecret) {
      await log("stripe_error", "account session returned no client secret");
      return fail("stripe_error", routed.mode, "no_client_secret");
    }
    return {
      ok: true,
      reason: null,
      clientSecret,
      publishableKey: routed.publishable,
      mode: routed.mode,
      code: null,
    };
  } catch (err) {
    const code = stripeErrorCode(err);
    await log("stripe_error", `${code}: ${errorDetail(err)}${stripeRequestIdOf(err)}`);
    return fail("stripe_error", routed.mode, code);
  }
}

/**
 * Connect.js asks for a client secret at start and again when a session
 * expires. Hand out the first secret once, then fetch a fresh one.
 */
export function firstSecretOnce(
  first: string,
  fetchFresh: () => Promise<string>,
): () => Promise<string> {
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
