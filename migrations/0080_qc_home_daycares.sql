-- Quebec recognized home daycares (milieux familiaux reconnus).
-- Separate from licensed centres. This file does not change that table.
-- No street address column. Postal code is the first 3 characters only.
-- Map coordinates are a municipality circle (radius at least 1500 m), never an exact pin.
-- No mail or SMS trigger. CASL: KidEase does not contact these providers.

create table if not exists qc_home_daycares (
  id text primary key,
  slug text not null unique,
  provider_type text not null,
  published_name text not null,
  personal_name boolean not null default true,
  municipality text,
  neighbourhood text,
  postal_fsa text,
  province text not null default 'QC',
  phone text,
  email text,
  website text,
  bureau_name text not null,
  source_url text not null,
  source_label text,
  verified_on date,
  capacity int,
  open_spots int,
  open_spots_as_of date,
  ages_served text,
  fees_text text,
  fee_unit text,
  area_lat double precision,
  area_lng double precision,
  area_radius_m int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qc_home_daycares_provider_type_chk
    check (provider_type = 'milieu_familial_reconnu'),
  constraint qc_home_daycares_province_chk
    check (province = 'QC'),
  constraint qc_home_daycares_postal_fsa_chk
    check (postal_fsa is null or postal_fsa ~ '^[A-Z][0-9][A-Z]$'),
  constraint qc_home_daycares_area_pair_chk
    check (
      (area_lat is null and area_lng is null)
      or (area_lat is not null and area_lng is not null)
    ),
  constraint qc_home_daycares_area_radius_chk
    check (area_radius_m is null or area_radius_m >= 1500),
  constraint qc_home_daycares_open_spots_chk
    check (open_spots is null or (open_spots >= 0 and open_spots <= 200))
);

create index if not exists qc_home_daycares_municipality_idx
  on qc_home_daycares (lower(municipality));

create index if not exists qc_home_daycares_postal_fsa_idx
  on qc_home_daycares (postal_fsa);

comment on table qc_home_daycares is
  'Quebec recognized home daycares. Not licensed-centre rows. Public pages hide personal names, streets, and exact pins.';

create table if not exists qc_home_daycare_requests (
  id text primary key,
  listing_id text not null references qc_home_daycares (id) on delete cascade,
  kind text not null,
  contact_name text not null,
  contact_email text not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint qc_home_daycare_requests_kind_chk
    check (kind in ('correction', 'removal')),
  constraint qc_home_daycare_requests_status_chk
    check (status in ('pending', 'reviewed'))
);

create index if not exists qc_home_daycare_requests_status_idx
  on qc_home_daycare_requests (status, created_at desc);

comment on table qc_home_daycare_requests is
  'Correction or removal asks for Quebec home daycares. Stored for admin review. No outbound email or SMS.';
