-- Background-check guidance. Flags stay off.
-- The centre records that it saw an official result. KidEase does not verify it.
-- A file, if the centre adds one, is optional and is not the personnel file.
-- To undo: see migrations/down/0212_background_check_guidance.sql

create table if not exists background_check_records (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  person_name text not null,
  role text not null,
  check_kind text not null,
  issued_on date,
  expires_on date,
  reviewed_by text,
  reviewed_name text,
  reviewed_at timestamptz,
  file_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('centre_staff', 'volunteer_student', 'home_provider', 'home_resident', 'operator')),
  check (check_kind in (
    'crrp',
    'crc_vsc',
    'vsc',
    'crc',
    'child_abuse_registry',
    'prior_contact',
    'social_development',
    'vae',
    'offence_declaration',
    'suitability_consent',
    'criminal_disclosure',
    'under18_disclosure'
  ))
);

create index if not exists background_check_records_centre_idx
  on background_check_records (daycare_id, person_name);

alter table daycares add column if not exists bg_check_attest int not null default 0;
alter table daycares add column if not exists bg_check_attest_at timestamptz;
alter table daycares add column if not exists bg_check_show_expiry int not null default 0;
alter table daycares add column if not exists bg_check_policy_months int;
