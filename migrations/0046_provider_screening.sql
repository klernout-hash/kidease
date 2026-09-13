-- Mandatory daycare-provider screening (first slice).
-- KidEase stores and reviews documents. It does not issue Vulnerable Sector
-- Checks. Only local police / RCMP (or BC CRRP) can.
-- Public listings may show centre-level screening_on_file after Admin clears
-- required current docs. Individual PDFs and person names stay off public pages.
-- Upload / approve / reject write listing_trust_events from the server.
-- Idempotent for PGLite + Neon.

-- Province + role pack. MB is seeded thoroughly; other jurisdictions are stubs.
create table if not exists provider_screening_requirements (
  id text primary key,
  province text not null,
  screening_role text not null check (screening_role in ('owner', 'director', 'staff', 'volunteer', 'home_resident')),
  doc_kind text not null check (doc_kind in ('vsc', 'child_abuse_registry', 'prior_contact')),
  required int not null default 1,
  min_age int not null default 18,
  facility_scope text not null default 'all' check (facility_scope in ('all', 'home')),
  pack_status text not null default 'stub' check (pack_status in ('seeded', 'stub')),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists provider_screening_req_uidx
  on provider_screening_requirements (province, screening_role, doc_kind, facility_scope);

-- People who must hold docs. Synced from centre_members; owner can add
-- volunteers / home residents who are not desk logins.
create table if not exists provider_screening_people (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  member_id text,
  user_id text,
  screening_role text not null check (screening_role in ('owner', 'director', 'staff', 'volunteer', 'home_resident')),
  display_name text not null,
  created_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists provider_screening_people_member_uidx
  on provider_screening_people (daycare_id, member_id)
  where member_id is not null;

create index if not exists provider_screening_people_centre_idx
  on provider_screening_people (daycare_id, archived_at);

create index if not exists provider_screening_people_user_idx
  on provider_screening_people (user_id);

-- One row per person × document kind. storage_ref is private (data URL or R2 key).
-- Never select storage_ref on public listing queries.
create table if not exists provider_screening_documents (
  id text primary key,
  daycare_id text not null references daycares(id) on delete cascade,
  person_id text not null references provider_screening_people(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('vsc', 'child_abuse_registry', 'prior_contact')),
  status text not null default 'missing' check (
    status in ('missing', 'letter_ready', 'uploaded', 'admin_review', 'cleared', 'rejected', 'expired')
  ),
  issued_on date,
  expires_on date,
  storage_ref text,
  storage_mime text,
  original_filename text,
  reviewer_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  letter_generated_at timestamptz,
  uploaded_by text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists provider_screening_docs_person_kind_uidx
  on provider_screening_documents (person_id, doc_kind);

create index if not exists provider_screening_docs_queue_idx
  on provider_screening_documents (status, updated_at desc);

create index if not exists provider_screening_docs_centre_idx
  on provider_screening_documents (daycare_id, status);

alter table daycares add column if not exists screening_on_file int not null default 0;
alter table daycares add column if not exists screening_on_file_at timestamptz;
alter table daycares add column if not exists screening_on_file_by text;

create index if not exists daycares_screening_on_file_idx on daycares (screening_on_file);

-- Manitoba pack: CRC + VSS and Child Abuse Registry for 18+ roles.
-- Home-based adds Prior Contact for those roles and for adult household residents.
insert into provider_screening_requirements
  (id, province, screening_role, doc_kind, required, min_age, facility_scope, pack_status, notes)
values
  ('psr_mb_owner_vsc_all', 'MB', 'owner', 'vsc', 1, 18, 'all', 'seeded',
    'Criminal Record Check with Vulnerable Sector Search. Issued only by local police or RCMP — KidEase cannot run or stamp this check. Required at 18+.'),
  ('psr_mb_owner_child_abuse_registry_all', 'MB', 'owner', 'child_abuse_registry', 1, 18, 'all', 'seeded',
    'Manitoba Child Abuse Registry Check. KidEase records the certificate; it does not search the registry itself.'),
  ('psr_mb_owner_prior_contact_home', 'MB', 'owner', 'prior_contact', 1, 18, 'home', 'seeded',
    'Prior Contact Check (Child and Family Services) for home-based licensees and adult household residents where the regulation applies.'),
  ('psr_mb_director_vsc_all', 'MB', 'director', 'vsc', 1, 18, 'all', 'seeded',
    'Criminal Record Check with Vulnerable Sector Search. Issued only by local police or RCMP — KidEase cannot run or stamp this check. Required at 18+.'),
  ('psr_mb_director_child_abuse_registry_all', 'MB', 'director', 'child_abuse_registry', 1, 18, 'all', 'seeded',
    'Manitoba Child Abuse Registry Check. KidEase records the certificate; it does not search the registry itself.'),
  ('psr_mb_director_prior_contact_home', 'MB', 'director', 'prior_contact', 1, 18, 'home', 'seeded',
    'Prior Contact Check (Child and Family Services) for home-based licensees and adult household residents where the regulation applies.'),
  ('psr_mb_staff_vsc_all', 'MB', 'staff', 'vsc', 1, 18, 'all', 'seeded',
    'Criminal Record Check with Vulnerable Sector Search. Issued only by local police or RCMP — KidEase cannot run or stamp this check. Required at 18+.'),
  ('psr_mb_staff_child_abuse_registry_all', 'MB', 'staff', 'child_abuse_registry', 1, 18, 'all', 'seeded',
    'Manitoba Child Abuse Registry Check. KidEase records the certificate; it does not search the registry itself.'),
  ('psr_mb_staff_prior_contact_home', 'MB', 'staff', 'prior_contact', 1, 18, 'home', 'seeded',
    'Prior Contact Check (Child and Family Services) for home-based licensees and adult household residents where the regulation applies.'),
  ('psr_mb_volunteer_vsc_all', 'MB', 'volunteer', 'vsc', 1, 18, 'all', 'seeded',
    'Criminal Record Check with Vulnerable Sector Search. Issued only by local police or RCMP — KidEase cannot run or stamp this check. Required at 18+.'),
  ('psr_mb_volunteer_child_abuse_registry_all', 'MB', 'volunteer', 'child_abuse_registry', 1, 18, 'all', 'seeded',
    'Manitoba Child Abuse Registry Check. KidEase records the certificate; it does not search the registry itself.'),
  ('psr_mb_volunteer_prior_contact_home', 'MB', 'volunteer', 'prior_contact', 1, 18, 'home', 'seeded',
    'Prior Contact Check (Child and Family Services) for home-based licensees and adult household residents where the regulation applies.'),
  ('psr_mb_home_resident_vsc_home', 'MB', 'home_resident', 'vsc', 1, 18, 'home', 'seeded',
    'Criminal Record Check with Vulnerable Sector Search. Issued only by local police or RCMP — KidEase cannot run or stamp this check. Required at 18+.'),
  ('psr_mb_home_resident_child_abuse_registry_home', 'MB', 'home_resident', 'child_abuse_registry', 1, 18, 'home', 'seeded',
    'Manitoba Child Abuse Registry Check. KidEase records the certificate; it does not search the registry itself.'),
  ('psr_mb_home_resident_prior_contact_home', 'MB', 'home_resident', 'prior_contact', 1, 18, 'home', 'seeded',
    'Prior Contact Check (Child and Family Services) for home-based licensees and adult household residents where the regulation applies.')
on conflict (id) do update set
  province = excluded.province,
  screening_role = excluded.screening_role,
  doc_kind = excluded.doc_kind,
  required = excluded.required,
  min_age = excluded.min_age,
  facility_scope = excluded.facility_scope,
  pack_status = excluded.pack_status,
  notes = excluded.notes;

-- Stub packs: VSC required for owner + staff. Other roles / docs expand later.
insert into provider_screening_requirements
  (id, province, screening_role, doc_kind, required, min_age, facility_scope, pack_status, notes)
values
  ('psr_bc_owner_vsc_all', 'BC', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_bc_staff_vsc_all', 'BC', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_ab_owner_vsc_all', 'AB', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_ab_staff_vsc_all', 'AB', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_sk_owner_vsc_all', 'SK', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_sk_staff_vsc_all', 'SK', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_on_owner_vsc_all', 'ON', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_on_staff_vsc_all', 'ON', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_qc_owner_vsc_all', 'QC', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_qc_staff_vsc_all', 'QC', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nb_owner_vsc_all', 'NB', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nb_staff_vsc_all', 'NB', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_ns_owner_vsc_all', 'NS', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_ns_staff_vsc_all', 'NS', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_pe_owner_vsc_all', 'PE', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_pe_staff_vsc_all', 'PE', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nl_owner_vsc_all', 'NL', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nl_staff_vsc_all', 'NL', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_yt_owner_vsc_all', 'YT', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_yt_staff_vsc_all', 'YT', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nt_owner_vsc_all', 'NT', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nt_staff_vsc_all', 'NT', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nu_owner_vsc_all', 'NU', 'owner', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.'),
  ('psr_nu_staff_vsc_all', 'NU', 'staff', 'vsc', 1, 18, 'all', 'stub',
    'Stub pack: Vulnerable Sector Check required for this role. Provincial extras (abuse registry, prior contact, CRRP) will be added later. KidEase does not issue police checks.')
on conflict (id) do update set
  province = excluded.province,
  screening_role = excluded.screening_role,
  doc_kind = excluded.doc_kind,
  required = excluded.required,
  min_age = excluded.min_age,
  facility_scope = excluded.facility_scope,
  pack_status = excluded.pack_status,
  notes = excluded.notes;
