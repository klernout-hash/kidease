-- Each family's alert clock. Empty means we do not invent a city.
alter table profiles add column if not exists time_zone text;
