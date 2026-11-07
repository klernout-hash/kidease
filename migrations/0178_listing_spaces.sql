-- Named rooms and spaces for a centre's own photos.
-- Deleting a space removes the assignment only. The photo stays on daycares.photos.
-- Reverse: migrations/down/0178_listing_spaces.sql

create table if not exists listing_spaces (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  name text not null,
  space_type text not null default 'other',
  amenities text not null default '',
  accessibility text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_spaces_name_len check (char_length(name) between 1 and 60),
  constraint listing_spaces_type_chk check (
    space_type in ('play', 'nap', 'meals', 'outdoor', 'entry', 'care', 'other')
  )
);

create index if not exists listing_spaces_daycare_idx
  on listing_spaces (daycare_id, sort_order);

create table if not exists listing_space_photos (
  space_id text not null references listing_spaces(id) on delete cascade,
  daycare_id text not null references daycares(id) on delete cascade,
  photo_src text not null,
  sort_order int not null default 0,
  primary key (space_id, photo_src)
);

create unique index if not exists listing_space_photos_one_space
  on listing_space_photos (daycare_id, photo_src);
