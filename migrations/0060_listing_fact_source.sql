-- Operator or admin source for a sourced age, fee, or photo fill.
-- Blank means we do not have a citation. Never backfilled from the catalogue fee guess.
alter table daycares add column if not exists fact_source text;
