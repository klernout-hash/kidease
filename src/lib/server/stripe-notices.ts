import { getSql } from "@/lib/db";
import { logSecurityEvent } from "@/lib/server/security-events";
import { disputeClosedBillStatus, shapeStripeNotice } from "@/lib/stripe-notices";

/**
 * Record a Stripe notice in the audit log (security_events, insert-only),
 * and apply the one money-state change: a won dispute puts the bill back
 * to paid. No messages go out from here.
 */
export async function applyStripeNoticeEvent(input: {
  type: string;
  object: unknown;
  account?: string | null;
}): Promise<{ ok: true; billId: string | null; status: string | null }> {
  const notice = shapeStripeNotice(input.type, input.object);
  if (!notice) return { ok: true, billId: null, status: null };
  const account = String(input.account || "").trim();
  await logSecurityEvent({
    kind: "stripe_notice",
    detail: account.startsWith("acct_") ? `${notice.detail} · ${account}` : notice.detail,
  });
  if (input.type !== "charge.dispute.closed")
    return { ok: true, billId: null, status: notice.status };

  const next = disputeClosedBillStatus(notice.status);
  if (!next) return { ok: true, billId: null, status: notice.status };
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from invoices
    where (${notice.objectId}::text is not null and stripe_dispute_id = ${notice.objectId})
       or (${notice.chargeId}::text is not null and stripe_charge_id = ${notice.chargeId})
    limit 1
  `.catch(() => []);
  const billId = rows[0]?.id ?? null;
  if (!billId) return { ok: true, billId: null, status: notice.status };
  if (next === "paid") {
    await sql`
      update invoices set status = ${"paid"}, updated_at = now()
      where id = ${billId} and status = ${"disputed"}
    `.catch(() => undefined);
    await sql`
      update payments set status = ${"paid"}
      where invoice_id = ${billId} and status = ${"disputed"}
    `.catch(() => undefined);
  }
  return { ok: true, billId, status: notice.status };
}
