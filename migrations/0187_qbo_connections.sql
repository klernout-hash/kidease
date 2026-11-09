-- Provider-owned QuickBooks Online connection.
-- Tokens are stored only as keq1: ciphertext. No Intuit call is made here.

create table if not exists qbo_connections (
  daycare_id text primary key references daycares(id) on delete cascade,
  user_id text not null,
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz,
  environment text not null,
  account_map jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists qbo_oauth_states (
  state text primary key,
  user_id text not null,
  daycare_id text not null references daycares(id) on delete cascade,
  expires_at timestamptz not null
);

create index if not exists qbo_oauth_states_expires_idx on qbo_oauth_states (expires_at);

create table if not exists qbo_exports (
  daycare_id text not null references daycares(id) on delete cascade,
  doc_number text not null,
  posted_at timestamptz not null default now(),
  primary key (daycare_id, doc_number)
);
