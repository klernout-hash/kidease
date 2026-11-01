-- Serious occurrence reports. FEATURE_INCIDENTS defaults off.
-- Practice mode logs notices and escalations. FEATURE_INCIDENTS_LIVE sends them.
-- Texts still need a stored CASL SMS opt-in. gov_province limits a government user.

alter table profiles add column if not exists gov_province text;

update profiles p
set gov_province = upper(o.province)
from government_members m
join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id
  and m.status = 'active'
  and (p.gov_province is null or btrim(p.gov_province) = '');

create table if not exists serious_incidents (
  id text primary key,
  daycare_id text not null,
  province text not null,
  kind text not null,
  summary text not null,
  child_label text,
  parent_user_id text,
  aware_at timestamptz not null,
  filed_at timestamptz,
  escalated_at timestamptz,
  parent_notice_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (kind in (
    'injury', 'allergy', 'missing_child', 'abuse_concern', 'illness',
    'medication_error', 'unplanned_disruption', 'death', 'other'
  ))
);

create index if not exists serious_incidents_province_idx
  on serious_incidents (province, aware_at desc);

create index if not exists serious_incidents_centre_idx
  on serious_incidents (daycare_id, aware_at desc);

-- Ontario filing clock is O. Reg. 137/15 s. 38(1)(b): 24 hours.
-- Other provinces are placeholders until their statute is confirmed.
create table if not exists incident_deadlines (
  province text primary key,
  hours int not null,
  verified int not null default 0,
  source text not null
);

insert into incident_deadlines (province, hours, verified, source) values
  ('ON', 24, 1, 'O. Reg. 137/15, s. 38(1)(b). https://www.ontario.ca/laws/regulation/150137'),
  ('AB', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('BC', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('MB', 24, 0, 'PLACEHOLDER. M.R. 17/99 s. 34 does not state an hour. https://web2.gov.mb.ca/laws/regs/current/017-99.php'),
  ('NB', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('NL', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('NS', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('NT', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('NU', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('PE', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('QC', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('SK', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.'),
  ('YT', 24, 0, 'PLACEHOLDER. Confirm the filing deadline with the province.')
on conflict (province) do nothing;
