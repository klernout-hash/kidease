-- Adults only. The signup checkbox stores the moment the person confirmed.
alter table profiles add column if not exists adult_confirmed_at timestamptz;
