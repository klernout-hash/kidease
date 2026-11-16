-- Reviewed data fix. Apply by hand. Do not run this from CI or against
-- production from a pull request.
--
-- A centre saved as Laval, QC whose pin is more than about 80 km from the
-- Laval city centre (45.6066, -73.7124) is cleared. This does not invent a street
-- coordinate. The bundled catalogue has no Laval, QC row
-- in that range. Winnipeg listings, including Lavallee, are a different
-- city and are not updated.
--
-- Rollback: restore lat, lng, and location from a database backup.
-- Do not guess a street pin.

-- `location` exists on Postgres with PostGIS and is absent from the local
-- bootstrap table. The statement that names it runs only when the column exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daycares'
      and column_name = 'location'
  ) then
    execute $sql$
      update daycares
      set lat = null,
          lng = null,
          location = null
      where lower(btrim(city)) = 'laval'
        and upper(btrim(province)) in ('QC', 'QUEBEC', 'QUÉBEC')
        and lat is not null
        and lng is not null
        and (
          lat < 44.88
          or lat > 46.33
          or lng < -74.74
          or lng > -72.68
        )
    $sql$;
  else
    update daycares
    set lat = null,
        lng = null
    where lower(btrim(city)) = 'laval'
      and upper(btrim(province)) in ('QC', 'QUEBEC', 'QUÉBEC')
      and lat is not null
      and lng is not null
      and (
        lat < 44.88
        or lat > 46.33
        or lng < -74.74
        or lng > -72.68
      );
  end if;
end $$;
