-- Support desk: one Case + timeline + audit. Staff roles live in profiles.role
-- (support | support_lead | admin). Do not invent a second auth table.

create table if not exists support_cases (
  id text primary key,
  status text not null default 'open',
  type text not null default 'other',
  priority text not null default 'normal',
  subject text not null,
  assignee_user_id text,
  parent_user_id text,
  provider_user_id text,
  centre_id text,
  listing_id text,
  stripe_payment_intent_id text,
  bill_id text,
  invoice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_cases_status_chk'
  ) then
    alter table support_cases
      add constraint support_cases_status_chk
      check (status in (
        'open', 'waiting_parent', 'waiting_centre', 'waiting_stripe', 'resolved', 'closed'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'support_cases_type_chk'
  ) then
    alter table support_cases
      add constraint support_cases_type_chk
      check (type in (
        'billing', 'claim', 'listing', 'account', 'trust', 'abuse', 'other'
      ));
  end if;
end $$;

create index if not exists support_cases_status_idx on support_cases (status, updated_at desc);
create index if not exists support_cases_assignee_idx on support_cases (assignee_user_id);
create index if not exists support_cases_parent_idx on support_cases (parent_user_id);
create index if not exists support_cases_centre_idx on support_cases (centre_id);
create index if not exists support_cases_bill_idx on support_cases (bill_id);

create table if not exists support_case_events (
  id text primary key,
  case_id text not null references support_cases(id) on delete cascade,
  actor_user_id text,
  kind text not null,
  body text,
  meta jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'support_case_events_kind_chk'
  ) then
    alter table support_case_events
      add constraint support_case_events_kind_chk
      check (kind in ('note', 'email', 'sms', 'status', 'refund', 'system'));
  end if;
end $$;

create index if not exists support_case_events_case_idx
  on support_case_events (case_id, created_at);

create table if not exists support_audit_log (
  id text primary key,
  actor_user_id text,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_audit_log_created_idx
  on support_audit_log (created_at desc);
create index if not exists support_audit_log_target_idx
  on support_audit_log (target_type, target_id);
