-- Floor tools: roll call, toileting, pickup check, health screen, allergen and incident notes.
-- Private to the centre. No email or SMS.

create table if not exists care_floor_records (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  kind text not null,
  booking_id text,
  payload jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (kind in ('roll', 'toilet', 'pickup', 'health', 'event'))
);

create index if not exists care_floor_records_centre_idx
  on care_floor_records (daycare_id, kind, created_at desc);
