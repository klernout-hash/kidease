# Read-only build migration gate

Normal `npm run build` now ends with `npm run db:migrate:check`, not the write-capable migrator. With `DATABASE_URL` configured, the check opens `BEGIN READ ONLY`, reads only `public._migrations`, compares its names with repository SQL filenames, and rolls back. Pending files, a missing/invalid ledger, connection/query errors or cleanup failure stop the build. Connection and server-statement timeouts are10seconds; the client query timeout is15seconds. No configured database keeps the existing local skip behavior.

The checker does not execute migration SQL, create a ledger, backfill rows, maintain accounts, reset credentials or seed demos. It never logs a connection string, driver error details, credentials or ledger row values. The separately invoked `npm run db:migrate` is unchanged and remains a write-capable operation requiring its own authorization. A blocked build must not automatically invoke it.

The CI build cache includes `package.json` and `scripts/check-migrations.mjs`, preventing an artifact from the old build command from satisfying the changed cache identity. The gate compares filenames, not schema contents or checksums; it does not establish database isolation or prove that an applied migration's contents were never edited.

The public live-smoke check uses the existing static `/robots.txt` response instead of `/api/health`; its other five public probes and existing authenticated rollback behavior remain unchanged. This checks document/static availability, not database health. Build/migration safety is separate from runtime navigation: application requests can still write normal telemetry, session or business data. No subscription flags, Stripe settings, account data or production database configuration are changed by this build-path change.

Focused verification uses injected clients and isolated in-memory PGlite only. Tests prove PostgreSQL read-only enforcement, unchanged fixture tables, closed transactions, pending/missing-ledger failures, sanitized errors, skipped unconfigured connections and separate manual/build command wiring. No real database credentials are needed or read by those tests.
