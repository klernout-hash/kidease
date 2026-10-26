-- Remove Rupinder Singh (mx-09f81152743c / rupinder-singh-1152743c)
-- from the public catalogue. Registry facility id: MB|home-rupinder-singh.
-- Retired the same way a duplicate is retired: inactive, not public, and
-- claim_status superseded. merged_into stays null, so the URL is a 404
-- and does not redirect to a city page or another listing.
-- The street and postal code are cleared on the retired row.
-- src/lib/listing-removed.ts blocks this id, slug, and facility id on import.
--
-- Rollback. Restores a public unclaimed row and the street. The previous
-- house coordinates are not in the repo. Restore lat/lng from a database
-- backup if the exact pin is required again. Do not guess them.
-- The import blocklist still refuses to publish this listing until
-- mx-09f81152743c is removed from src/lib/listing-removed.ts.
--
-- update daycares
-- set listing_active = 1,
--     visibility = 'public',
--     import_fault = null,
--     claim_status = 'unclaimed',
--     address = '72 Rutledge Crescent',
--     postal_code = 'R3W 0A4'
-- where (id = 'mx-09f81152743c' or slug = 'rupinder-singh-1152743c')
--   and import_fault = 'privacy_removed';

update daycares
set
  listing_active = 0,
  visibility = 'admin_only',
  import_fault = 'privacy_removed',
  claim_status = 'superseded',
  address = '',
  postal_code = '',
  description = btrim(regexp_replace(
    regexp_replace(
      coalesce(description, ''),
      '72[[:space:]]+Rutledge[[:space:]]+Crescent|Rutledge[[:space:]]+Crescent',
      '',
      'gi'
    ),
    'R3W[[:space:]-]*0A4',
    '',
    'gi'
  )),
  description_fr = btrim(regexp_replace(
    regexp_replace(
      coalesce(description_fr, ''),
      '72[[:space:]]+Rutledge[[:space:]]+Crescent|Rutledge[[:space:]]+Crescent',
      '',
      'gi'
    ),
    'R3W[[:space:]-]*0A4',
    '',
    'gi'
  ))
where id = 'mx-09f81152743c'
   or slug = 'rupinder-singh-1152743c';
