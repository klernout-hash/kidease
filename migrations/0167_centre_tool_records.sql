-- Centre tools (meal plans, observations, PD, checklists, bill drafts, test receipts).
-- Every tool flag defaults off. Payload is text and numbers only. No photos.

create table if not exists centre_tool_records (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  kind text not null,
  booking_id text,
  payload jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (kind in ('menu', 'observation', 'pd', 'maintenance', 'cleaning', 'bill', 'tap_receipt'))
);

create index if not exists centre_tool_records_centre_idx
  on centre_tool_records (daycare_id, kind, created_at desc);

create index if not exists centre_tool_records_booking_idx
  on centre_tool_records (booking_id, kind, created_at desc);
