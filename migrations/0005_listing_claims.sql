alter table daycares add column if not exists contact_email text;
alter table daycares add column if not exists claimed_at timestamptz;
alter table daycares add column if not exists claim_status text not null default 'unclaimed';

create table if not exists listing_claims (
  id text primary key,
  daycare_id text not null,
  user_id text not null,
  code text not null,
  license_photo text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists listing_claims_daycare_idx on listing_claims (daycare_id);
create index if not exists listing_claims_user_idx on listing_claims (user_id);
