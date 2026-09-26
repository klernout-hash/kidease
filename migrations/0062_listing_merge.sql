-- Retired duplicates point at the keeper. Rows stay in daycares (child tables cascade on delete).
-- import_fault marks a row hidden because its centre name could not be recovered.
-- pei_name_unrecoverable: a Prince Edward Island mx- row whose name is only a city and postal code.

alter table daycares add column if not exists merged_into text;
alter table daycares add column if not exists import_fault text;

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
end $$;

create index if not exists daycares_merged_into_idx
  on daycares (merged_into)
  where merged_into is not null;

create index if not exists daycares_import_fault_idx
  on daycares (import_fault)
  where import_fault is not null;
