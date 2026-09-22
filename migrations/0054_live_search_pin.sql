-- Live search: keep geography aligned with lat/lng, and index the approved-city lookup.
-- A pin stored only on lat/lng (or a stale geography point) must still fall inside
-- the city's radius. Not a one-centre update.

create index if not exists daycares_lat_lng_idx on daycares (lat, lng);

create index if not exists daycares_approved_city_idx
  on daycares (listing_active, claim_status, province);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'postgis')
     and exists (
       select 1 from information_schema.columns
       where table_name = 'daycares' and column_name = 'location'
     ) then
    execute $sync$
      update daycares
      set location = st_setsrid(st_makepoint(lng, lat), 4326)::geography
      where lat is not null
        and lng is not null
        and not (lat = 0 and lng = 0)
        and (
          location is null
          or st_distance(location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) > 1000
        )
    $sync$;
  end if;
end $$;
