-- Operator-owned QA fixtures use the same visibility / is_test flag as
-- "Show QA fixtures" in Admin. Public Live search already drops is_test = 1.
-- Peninsula Montessori Academy Oak (bc-3572, licence 3572) is Kyle's fixture.
-- Other centres whose provider owner is kyle@kidease.ca are the same fixtures.
-- An open claim alone does not hide a catalogue centre.
-- Kids World Daycare stays public — it is a real Edmonton centre.
-- Idempotent. Does not delete rows. Daycare desk still reads provider_daycares.

update daycares d
set visibility = 'admin_only',
    is_test = 1
where d.slug is distinct from 'kids-world-daycare-kh2t'
  and (
    lower(btrim(coalesce(d.slug, ''))) = 'peninsula-montessori-academy-oak-3572'
    or d.id = 'bc-3572'
    or (
      btrim(coalesce(d.license_number, '')) = '3572'
      and d.name ~* '^peninsula montessori academy oak'
    )
    or exists (
      select 1
      from provider_daycares pd
      join "user" u on u.id = pd.user_id
      where pd.daycare_id = d.id
        and lower(btrim(u.email)) = 'kyle@kidease.ca'
    )
  );
