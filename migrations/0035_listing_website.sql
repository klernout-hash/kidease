-- Optional public website on licensed listings (master-CSV enrichment / operator).
-- Seed never overwrites a filled website with blank; claimed rows are not updated.
alter table daycares add column if not exists website text;
