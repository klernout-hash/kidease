-- Which centre an organisation is working in. FEATURE_ORG_DASHBOARD stays off.

create table if not exists org_centre_focus (
  user_id text primary key,
  daycare_id text not null,
  updated_at timestamptz not null default now()
);
