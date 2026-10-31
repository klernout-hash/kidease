-- Thank-you notes and daycare family invite links.
-- A thank-you is a note on the account. It does not change a bill.

create table if not exists referral_rewards (
  id text primary key,
  referrer_user_id text not null,
  referred_user_id text not null unique,
  kind text not null default 'thank_you',
  created_at timestamptz not null default now(),
  constraint referral_rewards_kind_chk check (kind = 'thank_you')
);

create index if not exists referral_rewards_referrer_idx
  on referral_rewards (referrer_user_id, created_at desc);

create table if not exists family_invites (
  user_id text primary key,
  daycare_id text not null,
  centre_name text not null,
  code text not null unique,
  opens integer not null default 0,
  created_at timestamptz not null default now()
);
