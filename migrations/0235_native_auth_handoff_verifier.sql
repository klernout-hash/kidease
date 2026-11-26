-- Bind each native sign-in handoff code to the webview that started it.
-- Apply by hand (Neon SQL), never via npm run db:migrate. Undo: migrations/down/0235_native_auth_handoff_verifier.sql
--
-- verifier_hash is the SHA-256 (lowercase hex) of a random verifier that only
-- the starting webview holds, in an HttpOnly host-only cookie. A code is
-- redeemed only by a request that carries that cookie. Rows without a hash
-- can never be redeemed. Additive only.

alter table native_auth_handoff add column if not exists verifier_hash text;
