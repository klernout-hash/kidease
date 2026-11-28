-- Read-only parent policies for the initial shadow validation.
begin;

create index if not exists rls_child_pickup_checks_child_idx on public.child_pickup_checks (child_id);
create index if not exists rls_immunization_files_owner_idx on public.immunization_files (owner_user_id, child_id);
create index if not exists rls_medications_booking_parent_idx on public.care_medications (booking_id, parent_user_id);
create index if not exists rls_attendance_booking_parent_idx on public.attendance (booking_id, parent_user_id);

-- Column grants on bookings let policies confirm ownership without exposing booking details.
grant select (id, user_id, daycare_id, child_id) on public.bookings to kidease_child_family_shadow;
alter table public.bookings enable row level security;
create policy child_family_shadow_read on public.bookings
  for select to kidease_child_family_shadow using (user_id = kidease_rls.user_id());

grant select on
  public.children, public.child_care_people, public.child_profile_access, public.child_profile_shares,
  public.child_pickup_checks, public.immunization_files, public.immunization_views, public.care_medications,
  public.care_medication_logs, public.attendance, public.family_documents, public.family_document_shares
to kidease_child_family_shadow;

alter table public.children enable row level security;
create policy child_family_shadow_read on public.children
  for select to kidease_child_family_shadow using (user_id = kidease_rls.user_id());

alter table public.child_care_people enable row level security;
create policy child_family_shadow_read on public.child_care_people
  for select to kidease_child_family_shadow using (exists (
    select 1 from public.children c where c.id = child_care_people.child_id and c.user_id = kidease_rls.user_id()
  ));

alter table public.child_profile_access enable row level security;
create policy child_family_shadow_read on public.child_profile_access
  for select to kidease_child_family_shadow using (exists (
    select 1 from public.children c where c.id = child_profile_access.child_id and c.user_id = kidease_rls.user_id()
  ));

alter table public.child_profile_shares enable row level security;
create policy child_family_shadow_read on public.child_profile_shares
  for select to kidease_child_family_shadow using (exists (
    select 1 from public.children c where c.id = child_profile_shares.child_id and c.user_id = kidease_rls.user_id()
  ));

alter table public.child_pickup_checks enable row level security;
create policy child_family_shadow_read on public.child_pickup_checks
  for select to kidease_child_family_shadow using (exists (
    select 1 from public.children c where c.id = child_pickup_checks.child_id and c.user_id = kidease_rls.user_id()
  ));

alter table public.immunization_files enable row level security;
create policy child_family_shadow_read on public.immunization_files
  for select to kidease_child_family_shadow using (owner_user_id = kidease_rls.user_id() and exists (
    select 1 from public.children c where c.id = immunization_files.child_id and c.user_id = kidease_rls.user_id()
  ));

alter table public.immunization_views enable row level security;
create policy child_family_shadow_read on public.immunization_views
  for select to kidease_child_family_shadow using (exists (
    select 1 from public.children c where c.id = immunization_views.child_id and c.user_id = kidease_rls.user_id()
  ));

alter table public.care_medications enable row level security;
create policy child_family_shadow_read on public.care_medications
  for select to kidease_child_family_shadow using (parent_user_id = kidease_rls.user_id() and exists (
    select 1 from public.bookings b where b.id = care_medications.booking_id and b.daycare_id = care_medications.daycare_id
      and b.user_id = kidease_rls.user_id()
      and (care_medications.child_id is null or b.child_id = care_medications.child_id)
  ) and (child_id is null or exists (
    select 1 from public.children c where c.id = care_medications.child_id and c.user_id = kidease_rls.user_id()
  )));

alter table public.care_medication_logs enable row level security;
create policy child_family_shadow_read on public.care_medication_logs
  for select to kidease_child_family_shadow using (parent_user_id = kidease_rls.user_id() and exists (
    select 1 from public.care_medications m where m.id = care_medication_logs.medication_id
      and m.daycare_id = care_medication_logs.daycare_id and m.booking_id = care_medication_logs.booking_id
      and m.parent_user_id = kidease_rls.user_id()
  ));

alter table public.attendance enable row level security;
create policy child_family_shadow_read on public.attendance
  for select to kidease_child_family_shadow using (parent_user_id = kidease_rls.user_id() and exists (
    select 1 from public.bookings b where b.id = attendance.booking_id and b.daycare_id = attendance.daycare_id
      and b.user_id = kidease_rls.user_id()
  ));

alter table public.family_documents enable row level security;
create policy child_family_shadow_read on public.family_documents
  for select to kidease_child_family_shadow using (user_id = kidease_rls.user_id());

alter table public.family_document_shares enable row level security;
create policy child_family_shadow_read on public.family_document_shares
  for select to kidease_child_family_shadow using (exists (
    select 1 from public.family_documents d where d.id = family_document_shares.document_id
      and d.user_id = kidease_rls.user_id()
  ));

commit;
