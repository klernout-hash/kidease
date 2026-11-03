-- Click-wrap record for Provider Terms (claim + desk). Audit 2026-11-03.
create table if not exists provider_terms_acceptances (
  id text primary key,
  user_id text not null,
  daycare_id text not null,
  terms_version text not null,
  locale text not null default 'en',
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);
create index if not exists provider_terms_acceptances_user_idx on provider_terms_acceptances (user_id, daycare_id);
