-- Optional languages & culture signals on a listing.
-- Languages spoken by staff, cultural programs, and a short team note.
-- Never staff race, ethnicity, immigration status, or personal demographics.
-- Empty arrays / null stay hidden on the public listing.

alter table daycares add column if not exists staff_languages jsonb not null default '[]'::jsonb;
alter table daycares add column if not exists cultural_programs jsonb not null default '[]'::jsonb;
alter table daycares add column if not exists cultural_team_note text;
