-- Staff screening dates. FEATURE_STAFF_SCREENING defaults off.
-- Practice mode warns. FEATURE_STAFF_SCREENING_LIVE blocks an expired record from a new shift.

alter table profiles add column if not exists gov_province text;

update profiles p
set gov_province = upper(o.province)
from government_members m
join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id
  and m.status = 'active'
  and (p.gov_province is null or btrim(p.gov_province) = '');

create table if not exists staff_credentials (
  id text primary key,
  daycare_id text not null,
  province text not null,
  staff_name text not null,
  kind text not null,
  expires_on date,
  reminded_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (kind in ('criminal_record', 'vulnerable_sector', 'child_abuse_registry', 'ece_cert', 'first_aid'))
);

create index if not exists staff_credentials_centre_idx
  on staff_credentials (daycare_id, expires_on);

create index if not exists staff_credentials_province_idx
  on staff_credentials (province, expires_on);

-- Alberta: Alta. Reg. 143/2008, criminal record check with a vulnerable sector
-- search, renewed every 3 years.
-- https://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html
create table if not exists screening_rules (
  province text not null,
  kind text not null,
  valid_years int,
  verified int not null default 0,
  source text not null,
  primary key (province, kind)
);

insert into screening_rules (province, kind, valid_years, verified, source) values
  ('AB', 'criminal_record', 3, 1, 'Alta. Reg. 143/2008 staff rule: criminal record check including a vulnerable sector search, every 3 years.'),
  ('AB', 'vulnerable_sector', 3, 1, 'Alta. Reg. 143/2008 staff rule: vulnerable sector search is part of the criminal record check, every 3 years.'),
  ('ON', 'first_aid', null, 1, 'Ontario licensing manual: first aid including infant and child CPR. New staff have up to three months. The certificate shows the expiry. https://www.ontario.ca/document/child-care-centre-licensing-manual/part-3-ratios-and-group-size')
on conflict (province, kind) do nothing;
