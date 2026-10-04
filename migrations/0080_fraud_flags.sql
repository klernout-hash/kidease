-- Claim and review flags for the admin desk.
-- A row here does not approve a claim, publish a review, or hide a listing.

create table if not exists fraud_flags (
  id text primary key,
  kind text not null,
  source_id text,
  daycare_id text,
  score int,
  reasons text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists fraud_flags_created_idx
  on fraud_flags (created_at desc);

create table if not exists review_signals (
  id text primary key,
  daycare_id text,
  user_id text,
  ip_hash text,
  device_id text,
  body_norm text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists review_signals_recent_idx
  on review_signals (created_at desc);
