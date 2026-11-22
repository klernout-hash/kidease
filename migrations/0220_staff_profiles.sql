-- Staff job board: one profile per person. FEATURE_STAFF_JOB_BOARD stays off.
-- Providers see a short profile (first name, level, city, days, highlights)
-- until the person applies, accepts an invite, or is hired. The resume lives in
-- the private bucket (staff-resumes/ prefix), never in a public URL.
-- Lists (days, shifts, rooms, languages) are comma-separated codes.
-- To undo: see migrations/down/0220_staff_profiles.sql

create table if not exists staff_profiles (
  user_id text primary key,
  ref text not null,
  first_name text not null default '',
  last_name text not null default '',
  province text not null default '',
  cert_level text not null default '',
  cert_expires_on date,
  first_aid_expires_on date,
  years_experience int not null default 0,
  care_groups text not null default '',
  days text not null default '',
  shifts text not null default '',
  work_types text not null default '',
  start_date date,
  city text not null default '',
  postal_code text not null default '',
  lat double precision,
  lng double precision,
  radius_km int not null default 15,
  languages text not null default '',
  highlights text not null default '',
  phone text not null default '',
  resume_ref text,
  resume_mime text,
  resume_name text,
  visibility text not null default 'open',
  hide_from_employer int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility in ('open', 'applied_only', 'paused'))
);

create unique index if not exists staff_profiles_ref_uidx on staff_profiles (ref);
create index if not exists staff_profiles_open_idx on staff_profiles (province, visibility);
