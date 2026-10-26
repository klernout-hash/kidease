-- Friend share links. Opens and account joins only.

create table if not exists referral_codes (
  user_id text primary key,
  code text not null unique,
  opens integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists referral_joins (
  referred_user_id text primary key,
  code text not null,
  referrer_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists referral_joins_referrer_idx
  on referral_joins (referrer_user_id, created_at desc);
