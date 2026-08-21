-- Paid priority placement for claimed listings

alter table daycares add column if not exists priority_until timestamptz;

create table if not exists listing_promos (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  user_id text not null,
  plan text not null,
  days int not null,
  amount int not null,
  status text not null default 'paid',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists listing_promos_daycare_idx on listing_promos (daycare_id, ends_at desc);
create index if not exists listing_promos_user_idx on listing_promos (user_id);
