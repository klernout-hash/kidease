-- Canada-wide trust layer: jurisdictions + listing licence / claim / attestation fields.
-- KidEase verifies centres, licences, and claim ownership. It does not police-check educators.

create table if not exists ca_jurisdictions (
  code text primary key,
  name_en text not null,
  name_fr text not null,
  registry_url text,
  subsidy_url text,
  adapter_status text not null default 'stub',
  adapter_notes text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into ca_jurisdictions (code, name_en, name_fr, registry_url, subsidy_url, adapter_status, adapter_notes) values
  ('BC', 'British Columbia', 'Colombie-Britannique',
    'https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/finding-child-care',
    'https://www.gov.bc.ca/affordablechildcarebenefit',
    'stub', 'TODO: live registry adapter. Manual review against the BC childcare finder until a sync is wired.'),
  ('AB', 'Alberta', 'Alberta',
    'https://www.alberta.ca/lookup-child-care',
    'https://www.alberta.ca/child-care-subsidy',
    'stub', 'TODO: live registry adapter. Manual review against Alberta Lookup Child Care.'),
  ('SK', 'Saskatchewan', 'Saskatchewan',
    'https://www.saskatchewan.ca/residents/family-and-social-support/child-care',
    'https://www.saskatchewan.ca/residents/family-and-social-support/child-care',
    'stub', 'TODO: live registry adapter. Manual review against the Saskatchewan child care pages.'),
  ('MB', 'Manitoba', 'Manitoba',
    'https://childcaresearch.gov.mb.ca/en',
    'https://direct3.gov.mb.ca/daycare/see/see.nsf/see?ReadForm#/en-ca',
    'manual', 'Manitoba has a public childcare search. Operators review claims against that registry. Live scraper is a follow-up, not a half-UI.'),
  ('ON', 'Ontario', 'Ontario',
    'https://www.ontario.ca/page/licensed-child-care',
    'https://www.ontario.ca/page/child-care-subsidies',
    'stub', 'TODO: live registry adapter. Manual review against Ontario licensed child care.'),
  ('QC', 'Quebec', 'Québec',
    'https://www.mfa.gouv.qc.ca/en/services-de-garde/Parents/Pages/default.aspx',
    'https://www.revenuquebec.ca/en/citizens/tax-credits/tax-credit-for-childcare-expenses/',
    'stub', 'TODO: live registry adapter. Manual review against Québec services de garde.'),
  ('NB', 'New Brunswick', 'Nouveau-Brunswick',
    'https://www2.gnb.ca/content/gnb/en/departments/education/elcc.html',
    'https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-families/guide.html',
    'stub', 'TODO: live registry adapter. Manual review against New Brunswick ELCC.'),
  ('NS', 'Nova Scotia', 'Nouvelle-Écosse',
    'https://childcarenovascotia.ca/',
    'https://childcarenovascotia.ca/families/child-care-subsidy',
    'stub', 'TODO: live registry adapter. Manual review against Child Care Nova Scotia.'),
  ('PE', 'Prince Edward Island', 'Île-du-Prince-Édouard',
    'https://www.princeedwardisland.ca/en/information/education-and-early-years/licensed-early-learning-and-child-care',
    'https://peichildcareregistry.com/calculator.php',
    'stub', 'TODO: live registry adapter. Manual review against PEI licensed ELCC.'),
  ('NL', 'Newfoundland and Labrador', 'Terre-Neuve-et-Labrador',
    'https://www.gov.nl.ca/education/childcare/',
    'https://www.gov.nl.ca/education/childcare/childcaresubsidy/',
    'stub', 'TODO: live registry adapter. Manual review against NL child care.'),
  ('YT', 'Yukon', 'Yukon',
    'https://yukon.ca/en/find-child-care',
    'https://yukon.ca/en/universal-child-care',
    'stub', 'TODO: live registry adapter. Manual review against Yukon Find child care.'),
  ('NT', 'Northwest Territories', 'Territoires du Nord-Ouest',
    'https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care',
    'https://www.ece.gov.nt.ca/en/average-10-day-child-care',
    'stub', 'TODO: live registry adapter. Manual review against NWT early learning and child care.'),
  ('NU', 'Nunavut', 'Nunavut',
    'https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care',
    null,
    'stub', 'TODO: live registry adapter. Subsidy URL left null rather than guess a dead path.')
on conflict (code) do update set
  name_en = excluded.name_en,
  name_fr = excluded.name_fr,
  registry_url = excluded.registry_url,
  subsidy_url = excluded.subsidy_url,
  adapter_status = excluded.adapter_status,
  adapter_notes = excluded.adapter_notes,
  updated_at = now();

-- Listing trust fields. Existing license_number, province, claim_status, verified stay as-is.
alter table daycares add column if not exists license_status text not null default 'unverified';
alter table daycares add column if not exists license_expiry date;
alter table daycares add column if not exists licensed_capacity int;
alter table daycares add column if not exists registry_match_state text not null default 'unmatched';
alter table daycares add column if not exists license_verified_at timestamptz;
alter table daycares add column if not exists license_verification_source text;
alter table daycares add column if not exists staff_screening_attested int not null default 0;
alter table daycares add column if not exists staff_screening_attested_at timestamptz;
alter table daycares add column if not exists staff_screening_attested_by text;
alter table daycares add column if not exists stripe_identity_verified int not null default 0;

create index if not exists daycares_license_status_idx on daycares (license_status);
create index if not exists daycares_registry_match_idx on daycares (registry_match_state);
create index if not exists daycares_province_license_idx on daycares (province, license_status);

create table if not exists listing_trust_events (
  id text primary key,
  daycare_id text not null,
  actor_user_id text,
  kind text not null,
  note text,
  payload text,
  created_at timestamptz not null default now()
);

create index if not exists listing_trust_events_daycare_idx
  on listing_trust_events (daycare_id, created_at desc);

create table if not exists listing_reports (
  id text primary key,
  daycare_id text not null,
  user_id text,
  reporter_name text,
  reporter_email text,
  reason text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists listing_reports_created_idx on listing_reports (created_at desc);
create index if not exists listing_reports_daycare_idx on listing_reports (daycare_id);
