-- Retired duplicates point at the keeper. Rows stay in daycares (child tables cascade on delete).
-- import_fault marks a row hidden because its centre name could not be recovered,
-- or because it may be a second site (hidden_review_possible_second_site).
-- pei_name_unrecoverable: a Prince Edward Island mx- row whose name is only a city and postal code.
-- review_of points at the live sibling for Admin Merge. It is not a redirect.
-- A hidden review row keeps merged_into null so the public URL does not 301 to that sibling.

alter table daycares add column if not exists merged_into text;
alter table daycares add column if not exists import_fault text;
alter table daycares add column if not exists review_of text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_merged_into_fkey'
  ) then
    alter table daycares
      add constraint daycares_merged_into_fkey
      foreign key (merged_into) references daycares (id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_merged_into_not_self'
  ) then
    alter table daycares
      add constraint daycares_merged_into_not_self
      check (merged_into is null or merged_into <> id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_review_of_fkey'
  ) then
    alter table daycares
      add constraint daycares_review_of_fkey
      foreign key (review_of) references daycares (id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'daycares_review_of_not_self'
  ) then
    alter table daycares
      add constraint daycares_review_of_not_self
      check (review_of is null or review_of <> id);
  end if;
end $$;

create index if not exists daycares_merged_into_idx
  on daycares (merged_into)
  where merged_into is not null;

create index if not exists daycares_import_fault_idx
  on daycares (import_fault)
  where import_fault is not null;

create index if not exists daycares_review_of_idx
  on daycares (review_of)
  where review_of is not null;
