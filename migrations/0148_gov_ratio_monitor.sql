-- Room ratio checks. FEATURE_RATIO_MONITOR defaults off.
-- Counts only. No child names. Practice mode logs the director alert.

alter table profiles add column if not exists gov_province text;

update profiles p
set gov_province = upper(o.province)
from government_members m
join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id
  and m.status = 'active'
  and (p.gov_province is null or btrim(p.gov_province) = '');

create table if not exists ratio_checks (
  id text primary key,
  daycare_id text not null,
  province text not null,
  age_key text not null,
  children int not null,
  staff_count int not null,
  ok int not null,
  verified int not null default 0,
  created_by text not null,
  checked_at timestamptz not null default now()
);

create index if not exists ratio_checks_province_idx on ratio_checks (province, checked_at desc);

-- Ontario Schedule 1: infant is 3 staff for up to 10 children.
-- https://www.ontario.ca/document/child-care-centre-licensing-manual/part-3-ratios-and-group-size
-- Alberta Schedule 1 s. 27: infants under 12 months are 1:3, maximum 6.
-- https://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html
create table if not exists ratio_rules (
  province text not null,
  age_key text not null,
  staff_per_block int not null,
  children_per_block int not null,
  max_group int not null,
  verified int not null default 0,
  source text not null,
  primary key (province, age_key)
);

insert into ratio_rules (province, age_key, staff_per_block, children_per_block, max_group, verified, source) values
  ('ON', 'infant', 3, 10, 10, 1, 'O. Reg. 137/15 Schedule 1. 3 staff for up to 10 infants.'),
  ('ON', 'toddler', 1, 5, 15, 1, 'O. Reg. 137/15 Schedule 1. 1:5, maximum 15.'),
  ('ON', 'preschool', 1, 8, 24, 1, 'O. Reg. 137/15 Schedule 1. 1:8, maximum 24.'),
  ('AB', 'infant_under_12', 1, 3, 6, 1, 'Alta. Reg. 143/2008 Schedule 1 s. 27. 1:3, maximum 6.'),
  ('AB', 'infant_12', 1, 4, 8, 1, 'Alta. Reg. 143/2008 Schedule 1 s. 27. 1:4, maximum 8.'),
  ('BC', 'infant', 1, 4, 12, 0, 'PLACEHOLDER. Confirm the current B.C. ratio before a licensing decision.')
on conflict (province, age_key) do nothing;
