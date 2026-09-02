create table if not exists daycare_contracts (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  provider_user_id text,
  signer_name text,
  signer_email text not null,
  status text not null default 'draft',
  envelope_id text,
  signing_url text,
  document_name text not null default 'KidEase Centre Agreement',
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  last_event text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daycare_contracts_centre on daycare_contracts (daycare_id, created_at desc);
create index if not exists daycare_contracts_envelope on daycare_contracts (envelope_id);
