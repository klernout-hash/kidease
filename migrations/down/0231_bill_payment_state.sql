drop table if exists payment_mandates;

alter table invoices
  drop column if exists overdue_at,
  drop column if exists last_error_code,
  drop column if exists failed_at,
  drop column if exists processing_at,
  drop column if exists payment_state;
