-- Indexed city key for large catalogues such as Montreal.
-- The app keeps the old expression until FEATURE_CITY_SEARCH_KEY=1.

alter table daycares add column if not exists city_search_key text;

update daycares
set city_search_key = trim(regexp_replace(lower(translate(btrim(coalesce(city, '')), 'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÝŸýÿÇçÑñ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuYYyyCcNn')), '[^a-z0-9]+', ' ', 'g'))
where city_search_key is null;

create index if not exists daycares_city_search_key_idx
  on daycares (upper(btrim(coalesce(province, ''))), city_search_key);
