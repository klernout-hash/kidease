-- Re-flag leftover Title Case QA fixtures ("Test Test") that missed the
-- case-sensitive TEST prefix heuristic. Idempotent. Does not delete rows.
-- Does not touch real licensed names (Teston, Testing Academy, Joan Kids World).
-- Parent-facing queries also apply PUBLIC_LISTING_SQL even if this is skipped.

update daycares
set visibility = 'admin_only', is_test = 1
where
  name ~* '^test([ _-]|$)'
  or slug ~* '^test([_-]|$)'
  or name ~* '^qa[ _-]'
  or slug ~* '^qa[_-]'
  or lower(btrim(coalesce(name, ''))) in ('test', 'qa')
  or lower(btrim(coalesce(slug, ''))) in ('test', 'qa')
  or slug in ('test-test-p23f', 'test-test-nozo', 'test-test-p2tk');
