-- Canada parent UX pack: provider-editable listing fields + request-info leads.
-- Openings stay honest — opening_window is never backfilled from claim date or catalogue.

alter table daycares add column if not exists facility_type text;
alter table daycares add column if not exists schedule_options jsonb not null default '[]'::jsonb;
alter table daycares add column if not exists opening_window text;
alter table daycares add column if not exists programs jsonb not null default '[]'::jsonb;
alter table daycares add column if not exists financial_flags jsonb not null default '{}'::jsonb;
alter table daycares add column if not exists curriculum_tags jsonb not null default '[]'::jsonb;
alter table daycares add column if not exists values_note text;
alter table daycares add column if not exists safety_features jsonb not null default '[]'::jsonb;
alter table daycares add column if not exists promo_text text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_facility_type_chk'
  ) then
    alter table daycares
      add constraint daycares_facility_type_chk
      check (facility_type is null or facility_type in ('centre', 'nursery', 'home', 'school'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_opening_window_chk'
  ) then
    alter table daycares
      add constraint daycares_opening_window_chk
      check (opening_window is null or opening_window in ('immediate', 'upcoming', 'none'));
  end if;
end $$;

comment on column daycares.facility_type is
  'Provider-set Canada facility class: centre | nursery | home | school. Null = derive from amenities only.';
comment on column daycares.schedule_options is
  'Provider-set schedule offers: full | part | flexible. Empty = hidden from parent filters.';
comment on column daycares.opening_window is
  'Provider vacancy window. Public Immediate still requires honest fresh spots; never invent openings.';
comment on column daycares.programs is
  'Structured age programs (band, ages, FT/PT, fee). Empty falls back to confirmed age/fee columns.';
comment on column daycares.financial_flags is
  'Subsidy / sliding / sibling / meals flags set on the daycare desk.';
comment on column daycares.curriculum_tags is
  'Curriculum tags set on the daycare desk. Rendered only when present.';
comment on column daycares.values_note is
  'Optional values / faith note. Not a US religion list. Hidden when empty.';
comment on column daycares.safety_features is
  'Provider-set safety features. Hidden when empty.';
comment on column daycares.promo_text is
  'Optional public promo blurb from the daycare desk. Hidden when empty.';

-- Backfill facility_type from existing amenity tags only. Do not guess from names.
update daycares
set facility_type = 'home'
where facility_type is null
  and amenities ~ '(^|,)[[:space:]]*home[[:space:]]*(,|$)';

update daycares
set facility_type = 'nursery'
where facility_type is null
  and amenities ~ '(^|,)[[:space:]]*nursery[[:space:]]*(,|$)';

update daycares
set facility_type = 'school'
where facility_type is null
  and amenities ~ '(^|,)[[:space:]]*in-school[[:space:]]*(,|$)';

update daycares
set financial_flags = jsonb_build_object(
  'subsidy', amenities ~ '(^|,)[[:space:]]*(subsidy|funded|ten-a-day)[[:space:]]*(,|$)',
  'sliding', amenities ~ '(^|,)[[:space:]]*sliding-scale[[:space:]]*(,|$)',
  'sibling', amenities ~ '(^|,)[[:space:]]*sibling-discount[[:space:]]*(,|$)',
  'meals', amenities ~ '(^|,)[[:space:]]*meals[[:space:]]*(,|$)'
)
where financial_flags = '{}'::jsonb;

-- Request info leads (lightweight parent → centre). Guest user_id is guest:<email>.
alter table lead_requests add column if not exists parent_first_name text;
alter table lead_requests add column if not exists parent_last_name text;
alter table lead_requests add column if not exists parent_phone text;
alter table lead_requests add column if not exists contact_email text;

alter table lead_requests drop constraint if exists lead_requests_kind_chk;
alter table lead_requests
  add constraint lead_requests_kind_chk
  check (kind in ('tour', 'waitlist', 'spot_inquiry', 'info'));
