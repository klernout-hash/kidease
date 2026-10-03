# Sourced ages, 2026-10-02

`ages-sourced-20261002.csv`: 17,197 listings with sourced age bounds, approved by the owner on 2026-10-02.
No phone, email, or address columns.

Columns: listing_id, facility_id, age_min_months, age_max_months, age_groups, ages_source, ages_source_url

- Bounds are integers 0 to 216 with max > min. Nothing is invented.
- ages_source prefix says where the bounds came from: licensing_stated_range, registry_service_types_stated,
  registry_open_data+regulation, licensing_groups+regulation, licensing_program_option+regulation, website_stated.
- listing_id is the catalogue id (centres.json and extras) matched with matchingCatalogueRows from
  src/lib/catalog-master-sync.ts, or a unique same-province licence-number match, or the master id
  `mx-` + first 12 hex of sha256(facility_id) for rows the master sync appends.
- Excluded: listing d_d85jtifbkh2t, rows whose catalogue id is matched by several master rows with different
  bounds, ambiguous name matches, and master rows the sync cannot place.
