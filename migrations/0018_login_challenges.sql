create table if not exists login_challenges (
  id text primary key,
  user_id text not null,
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists login_challenges_user_idx on login_challenges (user_id, created_at desc);
