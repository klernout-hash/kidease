-- Sourced provincial fee program for one centre (canonical code, e.g. mb-10-day).
-- Blank means no confirmed program. Not a monthly CAD amount.
-- Never backfilled from a province-wide $10-a-day guess or the catalogue fee 218.
alter table daycares add column if not exists fee_program text;
