-- Cached public inspection rows for Ontario, British Columbia, and Alberta.
-- Empty until an import cites a government page. No catalogue rows are deleted.
-- The listing hides these until FEATURE_INSPECTION_HISTORY is on.

create table if not exists listing_inspections (
  id text primary key,
  province text not null,
  licence_number text not null,
  inspected_on date not null,
  outcome text not null,
  summary text not null default '',
  source_url text not null,
  fetched_at timestamptz not null default now()
);

create unique index if not exists listing_inspections_once
  on listing_inspections (province, licence_number, inspected_on, source_url);
