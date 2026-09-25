-- One-shot GoHighLevel signup claims.
-- crm_signup_at: parent account ping (admin notice + Parent Onboard).
-- crm_provider_at: provider ping (admin notice + Daycare Sign Up).
-- Stamp both for users created before 2026-09-24 17:34:00Z so a deploy
-- does not mass-send the existing book. Newer rows stay null and ping once.

alter table profiles add column if not exists crm_signup_at timestamptz;
alter table profiles add column if not exists crm_provider_at timestamptz;

update profiles
set crm_signup_at = now(),
    crm_provider_at = now()
where created_at < timestamptz '2026-09-24 17:34:00+00'
   or user_id in (
     select id from "user"
     where "createdAt" < timestamptz '2026-09-24 17:34:00+00'
   );
