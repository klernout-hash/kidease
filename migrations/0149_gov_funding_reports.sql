-- Monthly funding claim checks. FEATURE_FUNDING_REPORTS defaults off.
-- Stores counts only. No child names. Column layouts are placeholders.

alter table profiles add column if not exists gov_province text;
update profiles p
set gov_province = upper(o.province)
from government_members m
join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id and m.status = 'active'
  and (p.gov_province is null or btrim(p.gov_province) = '');

create table if not exists funding_reports (
  id text primary key,
  daycare_id text not null,
  province text not null,
  period text not null,
  blocked int not null default 0,
  verified int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists funding_reports_province_idx on funding_reports (province, period);

create table if not exists funding_formats (
  province text primary key,
  verified int not null default 0,
  source text not null
);
insert into funding_formats (province, verified, source) values
  ('ON', 0, 'PLACEHOLDER. Confirm the current CWELCC claim workbook before submission.'),
  ('MB', 0, 'PLACEHOLDER. Confirm Manitoba''s claim file before submission.'),
  ('AB', 0, 'PLACEHOLDER. Confirm Alberta''s claim file before submission.'),
  ('BC', 0, 'PLACEHOLDER. Confirm British Columbia''s claim file before submission.'),
  ('QC', 0, 'PLACEHOLDER. Confirm Quebec''s claim file before submission.')
on conflict (province) do nothing;
