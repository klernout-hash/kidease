-- Operator review queue for claimed / signed-up centres.
alter table listing_claims add column if not exists reviewed_at timestamptz;
alter table listing_claims add column if not exists reviewed_by text;
alter table listing_claims add column if not exists review_note text;

create index if not exists listing_claims_status_idx on listing_claims (status);
create index if not exists daycares_claim_status_idx on daycares (claim_status);
