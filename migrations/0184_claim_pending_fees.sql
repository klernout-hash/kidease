-- Optional fees saved with a pending claim. They do not change the public listing.
alter table listing_claims add column if not exists fee_infant integer;
alter table listing_claims add column if not exists fee_toddler integer;
alter table listing_claims add column if not exists fee_preschool integer;
