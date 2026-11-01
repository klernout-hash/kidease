-- Licence and compliance dates. FEATURE_COMPLIANCE_CALENDAR defaults off.
-- Reminders at 60, 30, and 7 days. Practice mode logs them.

alter table profiles add column if not exists gov_province text;

update profiles p
set gov_province = upper(o.province)
from government_members m
join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id
  and m.status = 'active'
  and (p.gov_province is null or btrim(p.gov_province) = '');

create table if not exists compliance_dates (
  id text primary key,
  daycare_id text not null,
  province text not null,
  kind text not null,
  due_on date not null,
  completed_at timestamptz,
  reminded_day int,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (kind in ('licence_renewal', 'inspection', 'fire_drill', 'food_safety', 'first_aid'))
);

create index if not exists compliance_dates_province_idx
  on compliance_dates (province, due_on);

create table if not exists licence_terms (
  province text primary key,
  months int not null,
  verified int not null default 0,
  source text not null
);

insert into licence_terms (province, months, verified, source) values
  ('MB', 12, 1, 'M.R. 17/99, s. 4(7): a licence is valid for one year. https://web2.gov.mb.ca/laws/regs/current/017-99.php'),
  ('ON', 24, 1, 'O. Reg. 137/15, s. 85.2: maximum licence term is two years. https://www.ontario.ca/laws/regulation/150137'),
  ('AB', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('BC', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('NB', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('NL', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('NS', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('NT', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('NU', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('PE', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('QC', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('SK', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.'),
  ('YT', 12, 0, 'PLACEHOLDER. Confirm the licence term with the province.')
on conflict (province) do nothing;
