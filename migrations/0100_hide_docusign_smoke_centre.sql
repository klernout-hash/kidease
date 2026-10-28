-- Hide the DocuSign webhook smoke centre and take it off non-admin desks.
-- KidEase DocuSign Smoke Test Centre is a database test row, not a real listing.
-- kyle@openroadoutlet.ca is a provider account (not admin). Unlink it by name.
-- kyle@kidease.ca may still open it from Admin with Show test listings on.
-- Idempotent. Does not delete the daycare row.

update daycares
set visibility = 'admin_only',
    is_test = 1,
    listing_active = 0
where name ilike '%docusign smoke%';

delete from provider_daycares pd
using daycares d, "user" u
where pd.daycare_id = d.id
  and pd.user_id = u.id
  and d.name ilike '%docusign smoke%'
  and lower(btrim(u.email)) = 'kyle@openroadoutlet.ca';

delete from provider_daycares pd
using daycares d, "user" u
where pd.daycare_id = d.id
  and pd.user_id = u.id
  and d.name ilike '%docusign smoke%'
  and lower(btrim(u.email)) <> 'kyle@kidease.ca';

delete from centre_members m
using daycares d, "user" u
where m.daycare_id = d.id
  and m.user_id = u.id
  and d.name ilike '%docusign smoke%'
  and lower(btrim(u.email)) <> 'kyle@kidease.ca';

-- Rollback:
-- update daycares set visibility = 'public', is_test = 0, listing_active = 1
-- where name ilike '%docusign smoke%';
-- Ownership rows for kyle@openroadoutlet.ca are not restored.
