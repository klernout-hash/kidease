-- Undo 0236_native_auth_handoff_verifier.sql. Drops only what 0235 added.
alter table native_auth_handoff drop column if exists verifier_hash;
