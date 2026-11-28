-- Isolated branch only. Connect as the owner of the tables under test.
begin;

create role kidease_child_family_shadow nologin noinherit nobypassrls;

create schema kidease_rls;
revoke all on schema kidease_rls from public;
grant usage on schema kidease_rls, public to kidease_child_family_shadow;

-- The trusted server supplies the authenticated identity in each transaction.
create function kidease_rls.user_id() returns text
language sql stable
set search_path = pg_catalog
as $$ select nullif(current_setting('app.user_id', true), '') $$;

revoke all on function kidease_rls.user_id() from public;
grant execute on function kidease_rls.user_id() to kidease_child_family_shadow;

commit;
