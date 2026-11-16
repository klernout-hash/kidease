-- Coordination only: existing settings determine which centres are eligible.
-- This does not register a schedule or enroll centres in the tracker.
create table if not exists centre_lead_worker_state (
  id text primary key check (id = 'centre-leads'),
  after_daycare_id text not null default '',
  lease_token text,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_until is null))
);
