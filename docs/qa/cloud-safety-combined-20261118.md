# Combined safety candidate, 18 November 2026

Local branch `cursor/cloud-safety-combined-nov18` combines the published safety fixes and their cloud follow-ups on baseline `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`:

- Outbound PR #938: `977d839d62c107bb127ac7cf624371834213792d`, followed by original cloud correction `42defb8a80629e4f6ababeda273d530589887ce5`.
- Photo PR #941: original `511cc8390209e201c69c646018818944ecfc7e68`, cherry-picked here as `d637e40c`; original cloud verification `af45cfa4999a454df2c13ae3b10097acd6458bb5`, cherry-picked here as `95f075f6`.

The two source worktrees remain clean at their original cloud heads. This is a separate worktree; no Mac branch was copied or recreated. No PR, remote branch, deployment or feature setting was changed. AGENTS.md was read; the source trees contain no .agents/skills directory. Explicit task restrictions supersede the general instruction to open a PR.

## Required browser provisioning

The check job runs the picker through `npm test`. `.github/workflows/ci.yml` now installs Chromium with the existing Playwright dependency's standard `npx playwright install --with-deps chromium` before the required Unit tests step. Neither step is conditional or allowed to fail. The YAML parses, and a structural assertion confirms installation precedes `npm test`. No browser test was skipped, renamed, or removed. GitHub CI, including its newly authorized existing payment mocks, has not been triggered for this local candidate.

## Combined verification actually completed

All application credentials, DATABASE_URL and feature variables were excluded. Each command received an environment containing only the inherited PATH/HOME and CI; NODE_ENV=production was added for the direct build and bundle guards. Exact lockfile dependencies were reused from the isolated outbound checkout, installed earlier with lifecycle scripts disabled. No .env file was copied.

```sh
node --experimental-strip-types --test \
  scripts/outbound-gate-failure.test.mjs scripts/outbound-controls.test.mjs \
  scripts/curriculum-photo-authorization.test.mjs scripts/curriculum-pack.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js \
  src/lib/outbound-controls.ts src/lib/outbound-gate-core.ts \
  src/lib/server/outbound-gate.ts src/lib/server/curriculum-pack.ts \
  src/components/curriculum-pack.tsx \
  scripts/outbound-gate-failure.test.mjs scripts/outbound-controls.test.mjs \
  scripts/curriculum-photo-authorization.test.mjs scripts/curriculum-pack.test.mjs \
  scripts/curriculum-photo-picker.test.mjs
node node_modules/vite/bin/vite.js build
node scripts/check-ssr-bundle.mjs
node scripts/check-locale-chunks.mjs
node scripts/check-client-db.mjs
```

- **111 focused tests passed**, zero failed, cancelled or skipped. SQL is synthetic in-memory fixture SQL; no configured database was connected.
- Typecheck and scoped lint passed with no diagnostics.
- Direct isolated Vite build passed. The package build wrapper, uploads and migration check were not run.
- Static bundle guards passed:75 server modules,8 lazy extra locales,843 client files with no database schema.
- The generated route-ordering-only diff was restored from HEAD.
- Logs are in `artifacts/cloud-safety-combined/` and included in the portable handoff.

Application and test source stayed unchanged after these checks. The final local commit adds the CI provisioning correction, this QA record and the reviewed preflight SQL only.

## Required browser run remains blocked

The actual setup command was attempted using the installed repository Playwright package:

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 node node_modules/playwright/cli.js install chromium
env -i PATH="$PATH" HOME="$HOME" CI=1 node --experimental-strip-types --test scripts/curriculum-photo-picker.test.mjs
```

The official download failed with DNS `EAI_AGAIN cdn.playwright.dev`, exit1, after the installer's own retry sequence. The required picker test then ran and failed at browser launch because `chromium_headless_shell-1234` was absent. **No browser assertion or screenshot pass is claimed.** The fixture was cleaned up. Logs: `artifacts/curriculum-photo-authorization/playwright-install-cloud.log` and `picker-tests-cloud.log`.

An earlier system-Chromium attempt failed at socket creation with EPERM; an earlier managed-browser attempt could not reach the isolated fixture. No socket policies, browser security flags, network routes or security settings were changed to bypass those restrictions. The portable handoff contains exact Mac commands. Its existing Google Chrome may be selected via the supported CHROME_PATH option.

## Database preflight boundaries

`docs/qa/release-schema-readonly-preflight.sql` is a proposed, statically reviewed probe and was **not executed**. Its active transaction reads only qualified system catalog metadata and builtin identity information, then rolls back. The original search_path remains observable. Initial results omit stored expression bodies, deparsers and custom type formatting/output calls. The ledger-name read is a separately gated commented example using an ordinary table only.

The known Preview error MIGRATIONS_PENDING establishes eight missing ledger filenames at build time, not missing schema and not Production state. All eight files already exist in the common baseline; neither safety fix adds migrations. A verified isolated Preview endpoint is needed before any further database verification. Database/role names alone cannot identify a Neon branch. Current schema, shadowing, ledger contents, staff-preset backfill completion, runtime grants and semantic equivalence of constraint/default/index expressions remain unverified. The stricter initial catalog probe intentionally does not prove full expression equivalence.

No database connection or migration application was attempted for this preflight. No independent PostgreSQL service is available for multi-session authorization/revocation tests. Authenticated live HTTP/R2 behavior remains unverified; issued signed links retain their existing maximum120-second lifetime.

## Release constraints

This candidate is local only. Keep release coordination separate from validation. Resolve exact-candidate CI/browser evidence and the identified Preview ledger/schema prerequisite without bypassing the checker. Do not run the generic migrator merely to clear the build; it also runs unrelated account/backfill/seed operations. Source rollback needs no down migration and can restore the prior safety weaknesses. Down scripts delete data/columns without repairing ledger entries.

No local payment tests (including mocks), real transactions, live outbound messages, production database, migration application, pushes, PR retargets, merges, deployments, or security/feature settings changes were performed.
