-- Current licence image on the listing + standalone uploads from the enroll form.
alter table daycares add column if not exists license_photo text;

create table if not exists license_uploads (
  id text primary key,
  daycare_id text,
  user_id text,
  centre_name text not null,
  contact_name text,
  contact_email text,
  city text,
  phone text,
  note text,
  license_photo text not null,
  created_at timestamptz not null default now()
);

create index if not exists license_uploads_created_idx on license_uploads (created_at desc);
create index if not exists license_uploads_daycare_idx on license_uploads (daycare_id);
