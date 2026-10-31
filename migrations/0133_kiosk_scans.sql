-- One QR check-in or check-out per child per rotating code window.
-- FEATURE_QR_KIOSK stays off until Kyle turns it on.

create table if not exists kiosk_scans (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  child_id text not null,
  parent_user_id text,
  action text not null,
  window_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists kiosk_scans_once_idx
  on kiosk_scans (daycare_id, child_id, window_id, action);

create index if not exists kiosk_scans_parent_idx
  on kiosk_scans (parent_user_id, created_at desc);
