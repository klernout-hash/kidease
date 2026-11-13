# Guardrails Kyle still turns on

This pull request adds the checks. It does not change GitHub branch protection, Vercel project settings, or any paid product.

## Read-only build migration check

Normal `npm run build` ends with `npm run db:migrate:check`. It never imports or runs `scripts/migrate.mjs`, migration SQL, account maintenance or demo seeding. This narrow prerequisite extracts the checker from [PR #841](https://github.com/klernout-hash/kidease/pull/841), source commit `cc87dea1af0f4ec659415b589f632912f2784e1a`, and adds the production configuration and failure checks below.

With `DATABASE_URL` configured, the checker lists repository SQL filenames, opens `BEGIN READ ONLY`, reads names from `public._migrations`, and issues `ROLLBACK`. It does not read SQL file contents. Missing, invalid or unavailable ledgers; pending files; empty or unreadable inventories; connection/query errors; asynchronous pool/client errors; and cleanup errors fail the build without applying anything. Connection and server-statement timeouts are 10 seconds; the client query timeout is 15 seconds. Errors contain a safe code and pending repository filenames, without driver details, connection strings or ledger values.

When `VERCEL_ENV` is exactly `production`, missing or blank `DATABASE_URL` fails with `MIGRATION_DATABASE_REQUIRED` before filesystem or connection access. Unconfigured local, CI and preview builds still skip; `NODE_ENV=production` alone does not force a remote check. A failed check never creates a ledger, records migrations, runs a fallback migrator or switches to an in-memory database. Necessary schema work must be reviewed and separately authorized before a later build checks the ledger.

The explicit manual `npm run db:migrate` command is unchanged and remains dangerous: even with no pending SQL, it can run backfills, protected-account maintenance, credential changes and environment-driven demo seeding. It requires separate authorization for its actual effects. Adding or testing this checker authorizes no production database, migration, seed, credential, account, security, merge or deployment operation.

The CI build-cache identity includes package scripts, the checker and migration files. The existing ignored-preview policy and deployment settings are unchanged; the new `cursor/*` branch adds no preview exception. Review hosting build/install overrides separately before rollout. The ledger comparison establishes recorded filenames only, not SQL checksums, schema equivalence, environment isolation or read-only application requests. Runtime session, telemetry and business writes are outside this build gate.

Focused tests use injected clients and synthetic configuration for fail-closed paths. Isolated PGlite tests verify database-enforced read-only transactions and unchanged fixture data. New live-smoke tests inject public responses without enabling rollback; existing rollback-request unit coverage is preserved. No test connects to a configured production database or performs a real rollback.

## Signed-in tests

GitHub Actions job `signed-in-e2e` (`.github/workflows/ci.yml`) builds the preview and signs in as the loopback parent and daycare fixtures. It checks English and French: login, still signed in after reload, `/parent` or `/provider`, messages, and Save details.

To make that job block a merge:

1. Open the repo on GitHub → Settings → Branches → the `main` rule.
2. Enable “Require status checks to pass”.
3. Add the check named `signed-in-e2e`.

Leave that box alone until you want it. This repo cannot flip it from a pull request.

## Live smoke and rollback

`.github/workflows/live-smoke.yml` runs after a GitHub `deployment_status` event whose environment is `Production` or `production`. It also runs from the Actions tab with “Run workflow”. It has a 2 minute limit. It only hits public pages on `https://www.kidease.ca` (`/`, `/login`, `/fr/login`, `/robots.txt`, `/sign-in`, `/sign-up`). It does not sign in on production. The static robots probe replaces `/api/health`, whose handler can write. These probes check public page availability, not database health.

If a check fails and these Actions secrets exist, the script calls Vercel’s instant rollback:

`POST /v1/projects/{projectId}/rollback/{deploymentId}`

([Vercel docs](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-previous-production-deployment-by-id))

It picks the previous READY production deployment, not the one that just failed.

Set these as repository Actions secrets when you want rollback. Until then a failed smoke stays red and does not call Vercel.

| Secret | What it is |
| --- | --- |
| `VERCEL_TOKEN` | A Vercel token that can roll back this project |
| `VERCEL_PROJECT_ID` | The project id (`prj_…`) |
| `VERCEL_ORG_ID` | The team id, only if the project is on a team |

The Vercel GitHub app must send deployment statuses, and the production environment name must be `Production` or `production`. This pull request does not change that connection.

## Alerts

No new paid monitor is added.

- `/api/health` is already public. `docs/uptime.md` describes an optional Better Stack heartbeat. Leave `BETTERSTACK_HEARTBEAT_URL` unset unless you already pay for that monitor.
- PostHog is already in the app. Turning on exception autocapture is a switch in the KidEase PostHog project. This pull request does not flip it.
- Vercel’s own alerts, if they need a paid add-on, stay off.

## Left for you

Payee and fee wording stays as it is. The claim approval that emails `kyle@kidease.ca` is not in this pull request. Plans stay hidden until `SUBSCRIPTIONS_ENABLED` is on, and store apps still hide plans when that flag is on.
