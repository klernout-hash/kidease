-- Where an approved age range came from. Blank means we do not have a citation.
-- scripts/migrate.mjs then fills data/ops/ages-sourced-20261002.csv once.
-- That fill only touches rows that exist, are unclaimed, and are not already confirmed.
alter table daycares add column if not exists ages_source text;
alter table daycares add column if not exists ages_source_url text;
