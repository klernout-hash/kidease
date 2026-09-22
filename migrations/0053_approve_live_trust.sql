-- Kids World Daycare (kids-world-daycare-kh2t): keep licence 70051797 visible,
-- put the listing on the Edmonton Live-search pin, and suppress duplicate claims.
-- Idempotent. Does not invent screening files or copy private PDFs onto public columns.
-- PGLite has no PostGIS; the geography update runs only when the extension exists.

update daycares
set license_number = '70051797'
where slug = 'kids-world-daycare-kh2t'
  and (
    license_number is null
    or btrim(license_number) = ''
    or lower(btrim(license_number)) in ('—', '-', 'unknown', 'n/a', 'na')
    or license_number = id
  );

update daycares
set claim_status = 'approved',
    claimed_at = coalesce(claimed_at, now()),
    verified = 1,
    license_status = 'matched',
    registry_match_state = 'matched',
    license_verification_source = case
      when lower(btrim(coalesce(license_verification_source, ''))) in ('admin', 'provider')
        then license_verification_source
      else 'admin'
    end,
    license_verified_at = coalesce(license_verified_at, now()),
    city = 'Edmonton',
    province = 'AB'
where slug = 'kids-world-daycare-kh2t'
  and coalesce(license_status, 'unverified') not in ('expired', 'suspended');

update daycares
set lat = 53.5461,
    lng = -113.4938
where slug = 'kids-world-daycare-kh2t'
  and (
    lat is null
    or lng is null
    or lat < 53.2
    or lat > 53.9
    or lng < -114.0
    or lng > -113.0
  );

update listing_claims
set status = 'superseded',
    reviewed_at = coalesce(reviewed_at, now()),
    review_note = coalesce(review_note, 'Superseded by the canonical Kids World claim')
where daycare_id = (select id from daycares where slug = 'kids-world-daycare-kh2t' limit 1)
  and status <> 'superseded'
  and id is distinct from (
    select id
    from listing_claims
    where daycare_id = (select id from daycares where slug = 'kids-world-daycare-kh2t' limit 1)
      and status <> 'declined'
    order by
      case when status = 'approved' then 0 when status in ('verified', 'waiting') then 1 else 2 end,
      created_at desc
    limit 1
  );

update listing_claims
set status = 'approved',
    reviewed_at = coalesce(reviewed_at, now())
where daycare_id = (select id from daycares where slug = 'kids-world-daycare-kh2t' limit 1)
  and status not in ('declined', 'superseded')
  and id = (
    select id
    from listing_claims
    where daycare_id = (select id from daycares where slug = 'kids-world-daycare-kh2t' limit 1)
      and status not in ('declined', 'superseded')
    order by
      case when status = 'approved' then 0 when status in ('verified', 'waiting') then 1 else 2 end,
      created_at desc
    limit 1
  );

update daycares
set listing_active = 0,
    claim_status = 'superseded'
where slug is distinct from 'kids-world-daycare-kh2t'
  and name ilike '%kids world%'
  and (
    upper(btrim(coalesce(province, ''))) in ('AB', 'ALBERTA')
    or city ilike 'edmonton%'
  )
  and coalesce(claim_status, '') is distinct from 'superseded';

update listing_claims
set status = 'superseded',
    reviewed_at = coalesce(reviewed_at, now()),
    review_note = coalesce(review_note, 'Superseded by kids-world-daycare-kh2t')
where daycare_id in (
  select id
  from daycares
  where slug is distinct from 'kids-world-daycare-kh2t'
    and name ilike '%kids world%'
    and (
      upper(btrim(coalesce(province, ''))) in ('AB', 'ALBERTA')
      or city ilike 'edmonton%'
    )
)
and status <> 'superseded';

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
      where slug = 'kids-world-daycare-kh2t'
        and lat is not null
        and lng is not null
    $sync$;
  end if;
end $$;
