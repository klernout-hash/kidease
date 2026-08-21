create table if not exists platform_events (
  id text primary key,
  kind text not null,
  daycare_name text,
  address text,
  city text,
  province text,
  slug text,
  provider_name text,
  provider_email text,
  listing_url text,
  email_to text not null,
  email_status text not null default 'queued',
  email_error text,
  created_at timestamptz not null default now()
);

create index if not exists platform_events_created_idx on platform_events (created_at desc);
