-- DaycareNearMe application schema

create table if not exists daycares (
  id text primary key,
  slug text unique not null,
  name text not null,
  name_fr text not null,
  tagline text not null,
  tagline_fr text not null,
  description text not null,
  description_fr text not null,
  address text not null,
  city text not null,
  province text not null default 'MB',
  postal_code text not null,
  lat double precision not null,
  lng double precision not null,
  phone text,
  hours text not null,
  hours_fr text not null,
  age_min_months int not null,
  age_max_months int not null,
  infant_monthly int,
  toddler_monthly int,
  preschool_monthly int,
  part_time_monthly int,
  spots_infant int not null default 0,
  spots_toddler int not null default 0,
  spots_preschool int not null default 0,
  waitlist int not null default 0,
  rating_x10 int not null default 45,
  review_count int not null default 0,
  license_number text,
  languages text not null default 'en',
  amenities text not null default '',
  photos text not null,
  verified int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  author text not null,
  rating int not null,
  body text not null,
  body_fr text not null,
  created_at timestamptz not null default now()
);

create table if not exists availability (
  daycare_id text not null references daycares(id) on delete cascade,
  month text not null,
  infant int not null,
  toddler int not null,
  preschool int not null,
  primary key (daycare_id, month)
);

create table if not exists profiles (
  user_id text primary key,
  role text not null default 'parent',
  locale text not null default 'en',
  phone text,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists children (
  id text primary key,
  user_id text not null,
  name text not null,
  birthdate text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists children_user_id_idx on children (user_id);

create table if not exists saved_daycares (
  user_id text not null,
  daycare_id text not null references daycares(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, daycare_id)
);

create table if not exists bookings (
  id text primary key,
  user_id text not null,
  daycare_id text not null references daycares(id),
  child_id text,
  start_month text not null,
  schedule text not null,
  age_group text not null,
  status text not null,
  monthly_amount int not null,
  created_at timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on bookings (user_id);

create table if not exists conversations (
  id text primary key,
  user_id text not null,
  daycare_id text not null references daycares(id),
  last_at timestamptz not null default now(),
  unique (user_id, daycare_id)
);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_convo_idx on messages (conversation_id, created_at);

create table if not exists payments (
  id text primary key,
  user_id text not null,
  booking_id text,
  daycare_id text not null,
  amount int not null,
  method text not null,
  status text not null,
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on payments (user_id);

create table if not exists provider_daycares (
  user_id text not null,
  daycare_id text not null references daycares(id) on delete cascade,
  primary key (user_id, daycare_id)
);

create table if not exists daycare_views (
  daycare_id text not null,
  viewed_on text not null,
  count int not null default 0,
  primary key (daycare_id, viewed_on)
);
