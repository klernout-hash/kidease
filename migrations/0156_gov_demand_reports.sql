-- Anonymized waitlist demand. FEATURE_DEMAND_REPORTS defaults off.
-- Groups under 5 are hidden. No parent or child columns.
alter table profiles add column if not exists gov_province text;
update profiles p set gov_province = upper(o.province)
from government_members m join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id and m.status = 'active' and (p.gov_province is null or btrim(p.gov_province) = '');
create table if not exists demand_report_runs (
  id text primary key,
  province text not null,
  quarter text not null,
  delivery text not null,
  created_at timestamptz not null default now()
);
