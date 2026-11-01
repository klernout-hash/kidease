-- Log of claim decision notices. The decision itself stays on the claim desk.

create table if not exists wiring_notices (
  id text primary key,
  feature text not null,
  user_id text not null,
  channel text not null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists claim_notice_log (
  id text primary key,
  daycare_id text not null,
  province text not null,
  decision text not null,
  mode text not null,
  created_at timestamptz not null default now()
);
