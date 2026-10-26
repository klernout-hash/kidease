-- Privacy: home daycare Rupinder Singh must not keep a street, postal code,
-- or house pin. Catalogue id mx-09f81152743c, slug rupinder-singh-1152743c.
-- City stays Winnipeg, MB. Coordinates move to the Winnipeg city area
-- (49.8951, -97.1384), the same point as WINNIPEG in src/lib/geo.ts.
-- src/lib/address-hidden.ts also strips this address on every public read
-- and on catalogue upsert, so a later registry import cannot put it back.
-- Running the rollback below does not show the street again until that
-- list no longer includes this id.
--
-- Rollback (street and postal only). The previous house coordinates are not
-- stored in the repo. Restore lat/lng from a database backup if the exact
-- pin is required again. Do not guess them.
--
-- update daycares
-- set
--   address = '72 Rutledge Crescent',
--   postal_code = 'R3W 0A4'
-- where id = 'mx-09f81152743c'
--    or slug = 'rupinder-singh-1152743c';

update daycares
set
  address = '',
  postal_code = '',
  description = btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        coalesce(description, ''),
        '72[[:space:]]+Rutledge[[:space:]]+Crescent|Rutledge[[:space:]]+Crescent',
        '',
        'gi'
      ),
      'R3W[[:space:]-]*0A4',
      '',
      'gi'
    ),
    '[[:space:]]{2,}',
    ' ',
    'g'
  )),
  description_fr = btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        coalesce(description_fr, ''),
        '72[[:space:]]+Rutledge[[:space:]]+Crescent|Rutledge[[:space:]]+Crescent',
        '',
        'gi'
      ),
      'R3W[[:space:]-]*0A4',
      '',
      'gi'
    ),
    '[[:space:]]{2,}',
    ' ',
    'g'
  )),
  tagline = btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        coalesce(tagline, ''),
        '72[[:space:]]+Rutledge[[:space:]]+Crescent|Rutledge[[:space:]]+Crescent',
        '',
        'gi'
      ),
      'R3W[[:space:]-]*0A4',
      '',
      'gi'
    ),
    '[[:space:]]{2,}',
    ' ',
    'g'
  )),
  tagline_fr = btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        coalesce(tagline_fr, ''),
        '72[[:space:]]+Rutledge[[:space:]]+Crescent|Rutledge[[:space:]]+Crescent',
        '',
        'gi'
      ),
      'R3W[[:space:]-]*0A4',
      '',
      'gi'
    ),
    '[[:space:]]{2,}',
    ' ',
    'g'
  )),
  lat = 49.8951,
  lng = -97.1384
where id = 'mx-09f81152743c'
   or slug = 'rupinder-singh-1152743c';

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
      where (id = 'mx-09f81152743c' or slug = 'rupinder-singh-1152743c')
        and lat is not null
        and lng is not null
    $sync$;
  end if;
end $$;
