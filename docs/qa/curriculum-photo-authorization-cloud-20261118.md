# Curriculum photo verification in the cloud, 18 November 2026

This continues the published draft PR #941 at exact head `511cc8390209e201c69c646018818944ecfc7e68`, based on `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. The cloud checkout is an isolated worktree on local branch `fix/photo-upload-interleavings-nov18`. No unpublished Mac branch was copied or recreated. Read `AGENTS.md`; this published tree has no `.agents/skills` directory.

## Changes

- `scripts/curriculum-photo-authorization.test.mjs`: add two synthetic overlapping-upload regressions. One request pauses at storage while another finishes metadata registration; both exact keys must remain registered and unrelated staff must remain blocked. If the paused request then has an unmatched metadata write, cleanup must target only its own object and preserve the successful upload.
- `scripts/curriculum-photo-picker.test.mjs`: honor the existing repository convention `CHROME_PATH` when choosing an installed browser, preserving the previous macOS/default fallback.

The server handlers and production behavior are unchanged. No new dependency, workflow, migration, deployment/security setting or feature activation is involved. These local changes have not been pushed or published.

## Checks actually run

The environment contains Node `v24.22.3`. Dependencies were installed from the published exact lockfile with lifecycle scripts disabled in the sibling outbound worktree, then linked into this isolated worktree. No credential or `.env` file was copied.

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 \
  node --experimental-strip-types --test \
  scripts/curriculum-photo-authorization.test.mjs \
  scripts/curriculum-pack.test.mjs
```

**80 passed, zero failed, skipped or cancelled.** This is 73 real-handler/PGlite synthetic tests plus seven pure curriculum tests. The handler harness rejects payment/Stripe imports, replaces storage/auth/database edges, and rejects `fetch`; the curriculum test imports pure local functions. Neither an aggregate suite nor a payment test or payment mock was run.

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 \
  node node_modules/typescript/bin/tsc --noEmit

env -i PATH="$PATH" HOME="$HOME" CI=1 \
  node node_modules/eslint/bin/eslint.js \
  src/lib/server/curriculum-pack.ts src/components/curriculum-pack.tsx \
  scripts/curriculum-photo-authorization.test.mjs \
  scripts/curriculum-photo-picker.test.mjs

git diff --check
```

All three passed with no diagnostics. Lint was repeated for the final two test-file edits and passed.

## Isolated build

After the sibling outbound build completed, the photo worktree ran:

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production \
  node node_modules/vite/bin/vite.js build

env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production \
  node scripts/check-ssr-bundle.mjs

env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production \
  node scripts/check-locale-chunks.mjs

env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production \
  node scripts/check-client-db.mjs
```

All four passed. The direct Vite build produced local Linux x64 Vercel output; it did not invoke the package build script, sourcemap upload, migration check or deployment. Static checks reported **75 server modules**, **eight extra languages remaining lazy**, and **843 client files without database/schema code**. Existing bundler warnings about route exports, externalized built-ins and ineffective dynamic imports remain; there was no build error. The only tracked generated change was route ordering in `src/routeTree.gen.ts`, which was restored from this worktree's `HEAD` after inspection.

## Browser infrastructure blocker

The one explicitly allowed picker test was attempted with synthetic fixture data only:

```sh
env -i PATH="$PATH" HOME="$HOME" CI=1 CHROME_PATH=/usr/bin/chromium \
  node --experimental-strip-types --test \
  scripts/curriculum-photo-picker.test.mjs
```

**Failed before page creation.** The fixture server started, but Chromium terminated at launch:

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
socket() failed: Operation not permitted (1)
```

The test command requested the execution tool's escalated local permissions, but the runtime still denied Chromium's socket creation and it exited with `SIGABRT`. No browser assertions or 390/1280 screenshots were produced by this cloud run. The test closed its fixture server and removed its generated fixture in `finally`. Browser/security flags were not changed to bypass the restriction. A rerun requires a host that permits Chromium's local process socket and the fixture's loopback requests.

## PostgreSQL verification gap and review boundaries

The cloud host has no `postgres`, `psql`, `pg_ctl` or Docker executable, no `/usr/lib/postgresql`, no PostgreSQL process, and no socket in `/var/run/postgresql` or `/tmp`. There is no already-available ephemeral independent PostgreSQL service. PGlite tests verify handler and SQL behavior plus deterministic request interleaving, **not** independent PostgreSQL sessions or production locking.

The metadata write checks consent, enrolment, parent/story relationships and centre staff access in one SQL statement snapshot. Existing `afterPut` fixtures prove rejection for changes committed before that write starts. Revocation racing a statement in another PostgreSQL session remains unverified. Link issuance also checks one database snapshot before signing; already-issued links retain the documented maximum 120-second lifetime.

The current documented policy permits the child's parent and active staff/owner at the exact centre. Granular staff permission presets are not consulted by these handlers. Readers check current booking consent; the original consent timestamp is only compared during upload metadata registration, so later consent replacement can restore access to an existing registered key on that booking. No new policy was inferred or changed here.

No real child data/photos, production database, live storage, external messages, aggregate suite, payment/Stripe test (including mocks), build upload, workflow run, PR retarget, merge, deployment or flag activation was performed. The explicit local-only/publication constraints override the repository's general instruction to open a PR.
