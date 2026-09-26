import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import {
  CheckoutUserError,
  StripeApiError,
  mapCheckoutError,
  redactStripeDetail,
} from "@/lib/stripe-public-error";

export type StripeCheckoutErrorRow = {
  id: string;
  at: string;
  userId: string | null;
  surface: string | null;
  publicMessage: string;
  detail: string;
};

export async function recordStripeCheckoutError(input: {
  userId?: string | null;
  surface: string;
  publicMessage: string;
  detail: string;
}) {
  const detail = redactStripeDetail(input.detail);
  console.error("[kidease-stripe]", input.surface, detail);
  try {
    const sql = await getSql();
    await sql`
      insert into stripe_checkout_errors (id, user_id, surface, public_message, detail)
      values (
        ${nid("sce")},
        ${input.userId ?? null},
        ${input.surface.slice(0, 80)},
        ${input.publicMessage.slice(0, 400)},
        ${detail}
      )
    `;
  } catch (err) {
    console.error("[kidease-stripe] could not store checkout error", err instanceof Error ? err.message : err);
  }
}

export async function recentStripeCheckoutErrors(limit = 8): Promise<StripeCheckoutErrorRow[]> {
  try {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      at: string;
      user_id: string | null;
      surface: string | null;
      public_message: string;
      detail: string;
    }>`
      select id, at, user_id, surface, public_message, detail
      from stripe_checkout_errors
      order by at desc
      limit ${Math.max(1, Math.min(20, limit))}
    `;
    return rows.map((row) => ({
      id: row.id,
      at: String(row.at),
      userId: row.user_id,
      surface: row.surface,
      publicMessage: row.public_message,
      detail: row.detail,
    }));
  } catch {
    return [];
  }
}

export async function runUserCheckout<T>(opts: {
  surface: string;
  userId?: string | null;
  fallback: string;
  fn: () => Promise<T>;
}): Promise<T> {
  try {
    return await opts.fn();
  } catch (err) {
    if (err instanceof CheckoutUserError || err instanceof StripeApiError) {
      const mapped = mapCheckoutError(err, opts.fallback);
      await recordStripeCheckoutError({
        userId: opts.userId,
        surface: opts.surface,
        publicMessage: mapped.publicMessage,
        detail: mapped.detail,
      });
      throw new Error(mapped.publicMessage);
    }
    const mapped = mapCheckoutError(err, opts.fallback);
    if (!mapped.passthrough) {
      await recordStripeCheckoutError({
        userId: opts.userId,
        surface: opts.surface,
        publicMessage: mapped.publicMessage,
        detail: mapped.detail,
      });
      throw new Error(mapped.publicMessage);
    }
    throw err;
  }
}
