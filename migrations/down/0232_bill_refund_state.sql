alter table invoices
  drop column if exists refund_method_label,
  drop column if exists refunded_at,
  drop column if exists refund_state,
  drop column if exists refunded_cents;
