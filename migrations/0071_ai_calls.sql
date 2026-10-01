-- AI call counts and a 24h response cache.
-- Stores feature, tokens, cost, and latency only.

create table if not exists ai_calls (
  id text primary key,
  feature text not null,
  ok boolean not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_micros int not null default 0,
  latency_ms int not null default 0,
  cache_hit boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_calls_feature_day_idx
  on ai_calls (feature, created_at);

create table if not exists ai_cache (
  cache_key text primary key,
  feature text not null,
  response_text text not null,
  expires_at timestamptz not null
);
