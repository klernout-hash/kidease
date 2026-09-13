-- Expand licensed facility types for Canada / Manitoba.
-- Map legacy centre | home | nursery | school (and empty US-style aliases).
-- Do not invent group_home from names.

alter table daycares drop constraint if exists daycares_facility_type_chk;

update daycares set facility_type = 'child_care_centre'
where facility_type in ('centre', 'center', 'daycare', 'daycare_center', 'daycare_centre');

update daycares set facility_type = 'family_home'
where facility_type in ('home', 'family_child_care', 'fcc');

update daycares set facility_type = 'nursery_preschool'
where facility_type in ('nursery', 'preschool', 'nursery_school');

update daycares set facility_type = 'school_age'
where facility_type in ('school', 'school_based', 'after_school', 'before_after');

update daycares set facility_type = 'group_home'
where facility_type in ('group_family', 'group_family_home', 'group_child_care');

-- Amenity-only group homes (never guessed from the listing name).
update daycares
set facility_type = 'group_home'
where facility_type is null
  and amenities ~ '(^|,)[[:space:]]*group-home[[:space:]]*(,|$)';

alter table daycares
  add constraint daycares_facility_type_chk
  check (
    facility_type is null
    or facility_type in (
      'child_care_centre',
      'family_home',
      'group_home',
      'nursery_preschool',
      'school_age'
    )
  );

comment on column daycares.facility_type is
  'Provider-set Canada facility class: child_care_centre | family_home | group_home | nursery_preschool | school_age. Null = derive from amenities only. Legacy centre/home/nursery/school map here.';
