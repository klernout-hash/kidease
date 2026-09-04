-- Fast lookup for same-name + same-address duplicates.
-- Franchise locations with the same name and a different address stay allowed.
create index if not exists daycares_name_address_city_idx
  on daycares (lower(btrim(name)), lower(btrim(address)), lower(btrim(city)));
