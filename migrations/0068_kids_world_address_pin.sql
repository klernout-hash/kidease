-- Kids World Daycare (kids-world-daycare-kh2t): pin the published street,
-- and use the parent fee and hours on kidsworlddaycare.ca.
-- Does not set spots, capacity, or a postal code. She did not publish those.
-- Fee columns become numeric so $326.25 is not rounded to $326.

alter table daycares
  alter column infant_monthly type numeric(8,2) using infant_monthly::numeric,
  alter column toddler_monthly type numeric(8,2) using toddler_monthly::numeric,
  alter column preschool_monthly type numeric(8,2) using preschool_monthly::numeric,
  alter column part_time_monthly type numeric(8,2) using part_time_monthly::numeric;

update daycares
set
  address = '11012 105 Avenue NW',
  lat = 53.5483389,
  lng = -113.5107201,
  hours = '7:00 a.m. – 5:30 p.m., Monday to Friday',
  hours_fr = '7:00 a.m. – 5:30 p.m., Monday to Friday',
  infant_monthly = 326.25,
  toddler_monthly = 326.25,
  preschool_monthly = 326.25,
  part_time_monthly = null,
  website = 'https://kidsworlddaycare.ca/',
  fact_source = 'https://kidsworlddaycare.ca/',
  promo_text = '50% off for the next 3 months.',
  programs = '[
    {"band":"infant","ageMinMonths":12,"ageMaxMonths":19,"schedules":["full"],"monthlyFee":326.25},
    {"band":"toddler","ageMinMonths":19,"ageMaxMonths":36,"schedules":["full"],"monthlyFee":326.25},
    {"band":"preschool","ageMinMonths":36,"ageMaxMonths":60,"schedules":["full"],"monthlyFee":326.25}
  ]'::jsonb
where slug = 'kids-world-daycare-kh2t';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'postgis')
     and exists (
       select 1 from information_schema.columns
       where table_name = 'daycares' and column_name = 'location'
     ) then
    execute $sync$
      update daycares
      set location = st_setsrid(st_makepoint(lng, lat), 4326)::geography
      where slug = 'kids-world-daycare-kh2t'
        and lat is not null
        and lng is not null
    $sync$;
  end if;
end $$;
