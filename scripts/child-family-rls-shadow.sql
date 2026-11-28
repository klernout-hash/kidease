-- psql --set=parent_id=... --file=scripts/child-family-rls-shadow.sql
-- Run as the isolated database owner who can SET ROLE to the shadow role.
\set ON_ERROR_STOP on
begin isolation level repeatable read;

-- Compare keys only. The baseline uses explicit ownership as an owner with RLS bypass.
set local row_security = off;
select
  (select coalesce(array_agg(id order by id), '{}') from public.children
      where user_id = :'parent_id')::text as children,
  (select coalesce(array_agg(a.id order by a.id), '{}') from public.attendance a
      join public.bookings b using (daycare_id) where a.booking_id = b.id
      and a.parent_user_id = :'parent_id' and b.user_id = :'parent_id')::text as attendance,
  (select coalesce(array_agg(id order by id), '{}') from public.immunization_files f
      where owner_user_id = :'parent_id' and child_id in
        (select id from public.children where user_id = :'parent_id'))::text as immunization,
  (select coalesce(array_agg(m.id order by m.id), '{}') from public.care_medications m
      join public.bookings b on b.id = m.booking_id and b.daycare_id = m.daycare_id
      where m.parent_user_id = :'parent_id' and b.user_id = :'parent_id'
        and (m.child_id is null or (m.child_id = b.child_id and exists (
          select 1 from public.children c where c.id = m.child_id and c.user_id = :'parent_id'
        ))))::text as medications,
  (select coalesce(array_agg(id order by id), '{}') from public.family_documents
      where user_id = :'parent_id')::text as documents
\gset baseline_

set local row_security = on;
set local role kidease_child_family_shadow;
select set_config('app.user_id', :'parent_id', true) is not null as context_set \gset
select
  coalesce((select array_agg(id order by id) from public.children), '{}')::text = :'baseline_children'
  and coalesce((select array_agg(id order by id) from public.attendance), '{}')::text = :'baseline_attendance'
  and coalesce((select array_agg(id order by id) from public.immunization_files), '{}')::text = :'baseline_immunization'
  and coalesce((select array_agg(id order by id) from public.care_medications), '{}')::text = :'baseline_medications'
  and coalesce((select array_agg(id order by id) from public.family_documents), '{}')::text = :'baseline_documents'
  as identical \gset

\if :identical
  \echo 'Shadow visibility matches baseline.'
\else
  -- A nonzero exit is required for a mismatch.
  select 1 / 0;
\endif
rollback;
