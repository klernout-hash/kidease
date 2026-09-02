-- Nearby search: PostGIS geography on licensed listings (Neon).
-- PGLite preview skips this file (no PostGIS). migrate.mjs applies it on DATABASE_URL.

create extension if not exists postgis;

alter table daycares add column if not exists location geography(Point, 4326);

update daycares
set location = st_setsrid(st_makepoint(lng, lat), 4326)::geography
where location is null
  and lat is not null
  and lng is not null;

create index if not exists daycares_location_gix on daycares using gist (location);

create or replace function daycares_set_location()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end;
$$;

drop trigger if exists daycares_location_sync on daycares;
create trigger daycares_location_sync
  before insert or update of lat, lng on daycares
  for each row
  execute procedure daycares_set_location();
