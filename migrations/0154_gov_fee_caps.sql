-- Parent fee cap warnings. FEATURE_FEE_CAPS defaults off.
-- A warning does not block publish or an invoice. Unverified caps are not enforced.
alter table profiles add column if not exists gov_province text;
update profiles p set gov_province = upper(o.province)
from government_members m join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id and m.status = 'active' and (p.gov_province is null or btrim(p.gov_province) = '');
create table if not exists fee_cap_flags (
  id text primary key,
  daycare_id text not null,
  province text not null,
  age_key text not null,
  daily_cents int not null,
  cap_cents int,
  source text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists fee_cap_flags_province_idx on fee_cap_flags (province, created_at desc);
create table if not exists fee_caps (
  province text not null,
  age_key text not null,
  max_daily_cents int,
  no_ceiling int not null default 0,
  verified int not null default 0,
  source text not null,
  primary key (province, age_key)
);
insert into fee_caps (province, age_key, max_daily_cents, no_ceiling, verified, source) values
  ('MB', 'infant', 1000, 0, 1, 'Manitoba maximum daily fee, 4 to 10 hours, effective Dec 8, 2024. https://www.manitoba.ca/education/childcare/families/pubs/maxdailyfee.pdf'),
  ('MB', 'preschool', 1000, 0, 1, 'Same Manitoba schedule. Infant and preschool, 4 to 10 hours: $10.'),
  ('ON', 'infant', 2200, 0, 1, 'Ontario CWELCC full-day cap of $22. Region of Peel 2026 guideline citing O. Reg. 488/24.'),
  ('ON', 'toddler', 2200, 0, 1, 'Ontario CWELCC full-day cap of $22 for toddler care in a CWELCC program.'),
  ('ON', 'preschool', 2200, 0, 1, 'Ontario CWELCC full-day cap of $22 for preschool care in a CWELCC program.'),
  ('BC', 'infant', null, 1, 1, 'British Columbia has no single parent-fee ceiling. https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-fee-reduction-initiative-provider-opt-in-status/information-for-families'),
  ('AB', 'infant', 1500, 0, 0, 'PLACEHOLDER. Confirm the Alberta parent fee schedule before enforcement.')
on conflict (province, age_key) do nothing;
