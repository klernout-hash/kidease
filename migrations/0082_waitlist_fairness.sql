-- Fair waitlist order. No fee. The audit log has no parent email or child name.

alter table daycare_waitlist add column if not exists sibling int not null default 0;
alter table daycare_waitlist add column if not exists start_date date;

create table if not exists daycare_waitlist_rules (
  daycare_id text primary key,
  sibling_priority int not null default 0
);

create table if not exists waitlist_audit (
  id text primary key,
  daycare_id text not null,
  entry_id text,
  place int,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists waitlist_audit_daycare_idx
  on waitlist_audit (daycare_id, created_at desc);
