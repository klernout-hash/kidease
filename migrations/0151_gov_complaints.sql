-- Licensing complaints. FEATURE_GOV_COMPLAINTS defaults off.
-- A parent does not have to name a child. SLA days are a placeholder.
alter table profiles add column if not exists gov_province text;
update profiles p set gov_province = upper(o.province)
from government_members m join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id and m.status = 'active' and (p.gov_province is null or btrim(p.gov_province) = '');
create table if not exists licensing_complaints (
  id text primary key,
  parent_user_id text not null,
  daycare_id text,
  province text not null,
  kind text not null,
  detail text not null,
  tracking_code text not null unique,
  status text not null default 'open',
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind in ('health', 'supervision', 'premises', 'staffing', 'fees', 'other')),
  check (status in ('open', 'closed'))
);
create index if not exists licensing_complaints_province_idx on licensing_complaints (province, created_at desc);
