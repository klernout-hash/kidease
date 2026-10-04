-- Optional French/English name search. Neon can install these.
-- PGLite and locked hosts skip the extension and keep the ilike search.

do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists daycares_name_trgm_idx
    on daycares using gin (lower(name) gin_trgm_ops);
exception when others then
  null;
end $$;

do $$
begin
  create extension if not exists unaccent;
exception when others then
  null;
end $$;
