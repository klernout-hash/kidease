export type InvoiceSettlementStatus = "paid" | "unpaid" | "refunded" | "partial";

/**
 * Read-side invoice settlement. Outputs cents even for rows that predate cents
 * columns. The stored status remains available for workflow labels such as void.
 */
export const INVOICE_READ_MODEL_SQL = `(
  select invoice.*,
    case
      when invoice.status = 'refunded' or invoice.refund_state = 'refunded'
        or (cents.amount_cents > 0 and cents.refunded_cents >= cents.amount_cents) then 'refunded'
      when invoice.refund_state = 'partly_refunded' or cents.refunded_cents > 0 then 'partial'
      when invoice.status = 'paid' then 'paid'
      else 'unpaid'
    end as settlement_status,
    cents.amount_cents as read_amount_cents,
    cents.fee_cents as read_fee_cents,
    greatest(cents.amount_cents - cents.refunded_cents, 0) as received_cents,
    greatest(
      coalesce(invoice.net_cents, cents.amount_cents - cents.fee_cents) - cents.refunded_cents,
      0
    ) as read_net_cents
  from invoices invoice
  cross join lateral (
    select
      coalesce(invoice.amount_cents, round(invoice.total::numeric * 100)::int, 0) as amount_cents,
      coalesce(invoice.platform_fee_cents, round(invoice.platform_fee::numeric * 100)::int, 0) as fee_cents,
      greatest(coalesce(invoice.refunded_cents, 0), 0) as refunded_cents
  ) cents
)`;

export const INVOICE_SETTLED_SQL = "i.settlement_status in ('paid', 'partial')";
export const INVOICE_OPEN_SQL = "(i.status = 'sent' and i.settlement_status = 'unpaid')";
