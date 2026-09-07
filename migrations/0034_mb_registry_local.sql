-- Manitoba adapter: local catalogue match (not a live government scrape).
update ca_jurisdictions
set adapter_status = 'adapter_ready',
    adapter_notes = 'Local KidEase catalogue match for bundled Manitoba licence numbers. Not a live scrape of childcaresearch.gov.mb.ca — official search stays the source of truth for inspections.',
    updated_at = now()
where code = 'MB';
