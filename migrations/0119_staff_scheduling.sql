-- Staff shifts and ECE certificates. Hidden until FEATURE_STAFF_SCHEDULING is on.
-- Not payroll. No child records. No catalogue rows are removed.

create table if not exists staff_shifts (
  id text primary key,
  daycare_id text not null,
  staff_name text not null,
  role text not null default 'ece',
  room_band text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_shifts_centre_idx on staff_shifts (daycare_id, starts_at);

create table if not exists ece_certificates (
  id text primary key,
  daycare_id text not null,
  staff_name text not null,
  province text not null,
  certificate_number text not null default '',
  level text not null default '',
  expires_on date not null,
  reminded_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists ece_certificates_centre_idx on ece_certificates (daycare_id, expires_on);
