-- Re-flag leftover QA / ghost fixtures so public catalogue SQL hides them.
-- Idempotent. Does not delete rows — Admin claim-lab may still need them.
-- Parent-facing queries also apply PUBLIC_LISTING_SQL even if this is skipped.

update daycares
set visibility = 'admin_only', is_test = 1
where
  id ilike 'ke-test-%'
  or slug ilike 'test-ghost-%'
  or coalesce(license_number, '') ilike 'TEST-%'
  or name like 'TEST %'
  or name ilike '%ghost claim%'
  or name ilike '%ghost listing%'
  or coalesce(address, '') ilike '%kidease test%';
