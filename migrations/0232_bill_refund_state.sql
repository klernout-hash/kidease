-- Partial and full refunds shown to parents (PE-8). Additive only.
-- refund_state sits beside BillStatus: a partial refund keeps the bill Paid.
alter table invoices
  add column if not exists refunded_cents integer null,
  add column if not exists refund_state text null check (refund_state in ('partly_refunded','refunded')),
  add column if not exists refunded_at timestamptz null,
  add column if not exists refund_method_label text null;
