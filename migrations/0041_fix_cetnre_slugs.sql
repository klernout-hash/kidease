-- Remap known registry letter-swap (cetnre → centre) on listing slugs and names.
-- Skips a row when the corrected slug is already taken by a different listing.
-- Claimed rows are included — seed upserts skip claimed_at is not null.

update daycares
set slug = regexp_replace(
  regexp_replace(slug, '\ycetnres\y', 'centres', 'gi'),
  '\ycetnre\y',
  'centre',
  'gi'
)
where slug ~* '\ycetnre'
  and not exists (
    select 1
    from daycares other
    where other.id <> daycares.id
      and other.slug = regexp_replace(
        regexp_replace(daycares.slug, '\ycetnres\y', 'centres', 'gi'),
        '\ycetnre\y',
        'centre',
        'gi'
      )
  );

update daycares
set name = regexp_replace(regexp_replace(name, '\yCetnres\y', 'Centres', 'g'), '\yCetnre\y', 'Centre', 'g')
where name ~ '\yCetnre';
