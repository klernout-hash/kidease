-- Durable public vs admin-only listing flag. The QA ghost stays in the
-- database for Kyle but must not appear on public catalogue surfaces.
alter table daycares add column if not exists visibility text not null default 'public';
alter table daycares add column if not exists is_test int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_visibility_chk'
  ) then
    alter table daycares
      add constraint daycares_visibility_chk
      check (visibility in ('public', 'admin_only'));
  end if;
end $$;

create index if not exists daycares_visibility_idx on daycares (visibility);
create index if not exists daycares_is_test_idx on daycares (is_test);

insert into daycares (
  id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
  address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
  age_min_months, age_max_months, spots_infant, spots_toddler, spots_preschool,
  license_number, languages, amenities, photos, verified, visibility, is_test
) values (
  'ke-test-ghost-001',
  'test-ghost-claim-lab',
  'TEST Ghost Claim Lab',
  'TEST Ghost Claim Lab',
  'QA ghost listing — not a real centre.',
  'Fiche QA — pas un vrai centre.',
  'KidEase internal test listing so the owner can walk Claim → licence → waiting → admin approve. Not a licensed daycare.',
  'Fiche interne KidEase pour le parcours Claim. Pas une garderie permis.',
  '100 KidEase Test Lane',
  'Winnipeg',
  'MB',
  'R3C 0A1',
  49.8992,
  -97.1391,
  '204-555-0100',
  '',
  '',
  0,
  0,
  2,
  4,
  6,
  'TEST-GHOST-0001',
  'en',
  'licensed',
  '',
  0,
  'admin_only',
  1
)
on conflict (id) do update set
  visibility = 'admin_only',
  is_test = 1,
  slug = excluded.slug,
  license_number = excluded.license_number;

update daycares
set visibility = 'admin_only', is_test = 1
where slug = 'test-ghost-claim-lab'
   or license_number = 'TEST-GHOST-0001'
   or id = 'ke-test-ghost-001'
   or name ilike '%Ghost Claim Lab%';
