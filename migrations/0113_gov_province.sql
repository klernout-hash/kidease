-- Province on a government account. FEATURE_GOV_SCOPES stays off until Kyle turns it on.
-- Setting role to government does not sign the person out.

alter table profiles add column if not exists gov_province text;
