-- PROPOSED ONLY. Reviewed statically; never executed or connected to a database.
-- Independently verify the endpoint/project/branch is the intended isolated
-- Preview database BEFORE any connection. PostgreSQL names cannot prove Neon
-- branch identity. Never print or paste a connection URL.
-- Active statements read fixed built-in catalog fields only, preserving the
-- real search_path. No application rows, expression deparsing or custom type
-- formatting are requested. Keep database/role/schema/object metadata private.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT pg_catalog.current_database() AS database_name,
       session_user AS login_role,
       current_user AS effective_role,
       pg_catalog.current_schema() AS first_application_schema,
       pg_catalog.current_setting('search_path'::pg_catalog.text) AS search_path,
       pg_catalog.current_schemas(true::pg_catalog.bool) AS effective_schemas,
       pg_catalog.current_setting('transaction_read_only'::pg_catalog.text) AS read_only,
       pg_catalog.to_regclass('public._migrations'::pg_catalog.text)::pg_catalog.oid AS public_ledger_oid,
       pg_catalog.to_regclass('_migrations'::pg_catalog.text)::pg_catalog.oid AS unqualified_ledger_oid;

WITH wanted(name) AS (VALUES
  ('_migrations'::pg_catalog.text),
  ('centre_lead_worker_state'::pg_catalog.text), ('onboarding_progress'::pg_catalog.text),
  ('centre_documents'::pg_catalog.text), ('care_floor_records'::pg_catalog.text),
  ('support_messages'::pg_catalog.text), ('support_threads'::pg_catalog.text), ('support_reads'::pg_catalog.text),
  ('device_sessions'::pg_catalog.text), ('centre_members'::pg_catalog.text), ('centre_invites'::pg_catalog.text),
  ('outbound_controls'::pg_catalog.text), ('outbound_daily_usage'::pg_catalog.text), ('outbound_control_audit'::pg_catalog.text),
  ('daycares'::pg_catalog.text), ('provider_daycares'::pg_catalog.text), ('children'::pg_catalog.text), ('bookings'::pg_catalog.text),
  ('learning_stories'::pg_catalog.text), ('curriculum_story_meta'::pg_catalog.text),
  ('care_child_room_assignments'::pg_catalog.text), ('care_rooms'::pg_catalog.text)
), relations AS (
  SELECT n.nspname, c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid OPERATOR(pg_catalog.=) c.relnamespace
  WHERE c.relkind OPERATOR(pg_catalog.=) ANY (ARRAY['r','p','v','m','f']::pg_catalog."char"[])
)
SELECT w.name AS expected_relation,
       r.oid AS relation_oid,
       r.nspname AS actual_schema,
       r.relkind,
       pg_catalog.pg_table_is_visible(r.oid) AS unqualified_target,
       r.relrowsecurity,
       r.relforcerowsecurity,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'name', a.attname,
         'number', a.attnum,
         'type_oid', a.atttypid,
         'type_name', t.typname,
         'type_schema', tn.nspname,
         'type_kind', t.typtype,
         'base_type_oid', t.typbasetype,
         'type_modifier', a.atttypmod,
         'collation_oid', a.attcollation,
         'not_null', a.attnotnull,
         'default_present', d.oid IS NOT NULL,
         'identity_kind', a.attidentity,
         'generated_kind', a.attgenerated
       ) ORDER BY a.attnum)
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_type t ON t.oid OPERATOR(pg_catalog.=) a.atttypid
        JOIN pg_catalog.pg_namespace tn ON tn.oid OPERATOR(pg_catalog.=) t.typnamespace
        LEFT JOIN pg_catalog.pg_attrdef d
          ON d.adrelid OPERATOR(pg_catalog.=) a.attrelid AND d.adnum OPERATOR(pg_catalog.=) a.attnum
        WHERE a.attrelid OPERATOR(pg_catalog.=) r.oid
          AND a.attnum OPERATOR(pg_catalog.>) 0::pg_catalog.int2 AND NOT a.attisdropped
       ) AS columns,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'oid', k.oid,
         'name', k.conname,
         'kind', k.contype,
         'column_numbers', k.conkey,
         'referenced_relation_oid', k.confrelid,
         'referenced_column_numbers', k.confkey,
         'supporting_index_oid', k.conindid,
         'deferrable', k.condeferrable,
         'initially_deferred', k.condeferred,
         'validated', k.convalidated,
         'check_expression_present', k.conbin IS NOT NULL,
         'foreign_update_action', k.confupdtype,
         'foreign_delete_action', k.confdeltype,
         'foreign_match_kind', k.confmatchtype
       ) ORDER BY k.conname)
        FROM pg_catalog.pg_constraint k WHERE k.conrelid OPERATOR(pg_catalog.=) r.oid
       ) AS constraints,
       (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
         'oid', i.indexrelid,
         'name', ix.relname,
         'access_method_oid', ix.relam,
         'access_method_name', am.amname,
         'column_numbers', i.indkey::pg_catalog.int2[],
         'key_column_count', i.indnkeyatts,
         'total_column_count', i.indnatts,
         'operator_class_oids', i.indclass::pg_catalog.oid[],
         'collation_oids', i.indcollation::pg_catalog.oid[],
         'option_bits', i.indoption::pg_catalog.int2[],
         'unique', i.indisunique,
         'primary', i.indisprimary,
         'exclusion', i.indisexclusion,
         'immediate', i.indimmediate,
         'valid', i.indisvalid,
         'ready', i.indisready,
         'live', i.indislive,
         'expression_present', i.indexprs IS NOT NULL,
         'predicate_present', i.indpred IS NOT NULL
       ) ORDER BY i.indexrelid)
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class ix ON ix.oid OPERATOR(pg_catalog.=) i.indexrelid
        LEFT JOIN pg_catalog.pg_am am ON am.oid OPERATOR(pg_catalog.=) ix.relam
        WHERE i.indrelid OPERATOR(pg_catalog.=) r.oid
       ) AS indexes
FROM wanted w LEFT JOIN relations r ON r.relname::pg_catalog.text OPERATOR(pg_catalog.=) w.name
ORDER BY w.name, r.nspname;

ROLLBACK;

-- STOP here and inspect metadata. No schema, ledger or target identity has
-- been established by this unexecuted file. Catalog structure alone cannot
-- prove default/check/index expression equivalence, SQL checksums, migration
-- history, original consent policy, data backfills or deployment readiness.
-- Deparsing any expression/predicate or formatting custom types needs a
-- separately reviewed phase: type output/typmod functions may execute user
-- code and expression text may expose sensitive literal values.
--
-- OPTIONAL INDEPENDENT PHASE: keep the entire transaction below commented.
-- Before considering it, verify public._migrations is the intended ordinary
-- table (relkind r), BOTH RLS flags are off, and name is a nongenerated direct
-- pg_catalog.text column (not a domain/custom type). Review index metadata;
-- stop on unexpected custom access methods/operator classes or other objects.
-- ONLY prevents inherited/foreign child relations from being scanned.
-- Do not uncomment this boundary automatically or treat it as authorization.
/*
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT name FROM ONLY public._migrations
WHERE name OPERATOR(pg_catalog.=) ANY (ARRAY[
  '0204_centre_lead_worker.sql', '0204_first_run_onboarding.sql',
  '0205_centre_documents.sql', '0206_care_floor.sql',
  '0208_live_support.sql', '0208_persistent_sessions.sql',
  '0209_staff_permissions.sql', '0210_outbound_controls.sql'
]::pg_catalog.text[])
ORDER BY name;
ROLLBACK;
*/
-- This optional restricted list checks only the eight previously reported
-- names. It is not a complete repository/ledger inventory comparison.
-- A second shadowing ledger needs a separately reviewed explicitly qualified,
-- safely quoted table-name query after inspection; never dynamic guessing.
-- Matching structure does not establish 0209's staff/manager backfill effects.
-- Before considering ledger reconciliation, separately review migration
-- history and, only if needed/authorized, aggregate null-preset counts. Do not
-- read staff/child identifiers, photo keys, session tokens or business rows.
