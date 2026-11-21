# Database backups

KidEase's database is Neon project `kidease-db` (`aged-scene-45559711`, us-east-1),
database `neondb` (~228 MB in Nov 2026), Launch plan.

There are two layers:

1. **Neon point-in-time restore (history window).** Built into Neon. On Launch the
   maximum is 7 days. Use it for "undo the last few hours/days" mistakes: create a
   branch from a past timestamp in the Neon console. Do not upgrade the plan just to
   lengthen this window.
2. **Weekly off-site dump to Cloudflare R2.** A copy that lives outside Neon, for the
   case where Neon itself or the project is lost. This document is mostly about this.

## What runs

| Workflow | When | What |
| --- | --- | --- |
| `.github/workflows/db-backup.yml` | Sundays 08:30 UTC (03:30 Toronto) + manual | `pg_dump --format=custom --no-owner` (PostgreSQL 18 client from PGDG), `pg_restore --list` sanity check, upload to R2, size check. First Sunday of the month also copies to `monthly/`. |
| `.github/workflows/db-restore-test.yml` | 1st of Jan/Apr/Jul/Oct 09:00 UTC + manual | Downloads the newest `weekly/` dump, restores it into a throwaway PostGIS 18 container inside the job, checks `daycares` and `profiles` have rows, then discards it. Neon is not touched. |

Both run on GitHub Actions (free on this public repo), use `permissions: contents: read`,
never upload the dump as a workflow artifact and never print secrets. A failed run is
red in the Actions tab and GitHub emails the repo owner.

## Where it goes

Private R2 bucket **`kidease-db-backups`** on the Cloudflare account that owns kidease.ca.

- No public access: r2.dev URL disabled, no custom domain. It is **not** `kidease-media`
  (the public photo bucket behind media.kidease.ca), so nothing here is reachable
  over media.kidease.ca.
- Keys:
  - `weekly/YYYY-MM-DD.dump`
  - `monthly/YYYY-MM.dump`

## Retention

Enforced by R2 lifecycle rules on the bucket (not by the workflow):

- `weekly/`: deleted after 35 days (~4–5 copies kept)
- `monthly/`: deleted after 400 days (~13 copies kept)

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | Neon **unpooled** connection string (same as Vercel `DATABASE_URL_UNPOOLED`) |
| `BACKUP_R2_ACCOUNT_ID` | Cloudflare account ID (endpoint is `https://<id>.r2.cloudflarestorage.com`) |
| `BACKUP_R2_ACCESS_KEY_ID` | R2 API token access key, **Object Read & Write, scoped to `kidease-db-backups` only** |
| `BACKUP_R2_SECRET_ACCESS_KEY` | Secret for the key above |

Create the R2 key in Cloudflare dashboard → R2 → Manage API tokens → Create API token →
Object Read & Write → Apply to specific buckets only → `kidease-db-backups`.
The app's existing `R2_*` key is scoped to `kidease-media` only and cannot write here
(by design; keep it that way). If the database password is rotated in Neon, update
`BACKUP_DATABASE_URL`.

## How to restore

Download a dump (needs the R2 key above and aws-cli, or download it from the
Cloudflare dashboard → R2 → `kidease-db-backups`):

```sh
aws s3 cp s3://kidease-db-backups/weekly/2026-11-22.dump ./db.dump \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com --region auto
pg_restore --list ./db.dump | head   # inspect
```

**Into a Neon branch (recommended for real recovery or inspection).** In the Neon console
create a new empty branch (or a new project if the original is gone), copy its
**unpooled** connection string, then:

```sh
pg_restore --no-owner --no-privileges --dbname "$NEW_BRANCH_URL" ./db.dump
```

Check it, then point Vercel `DATABASE_URL`/`DATABASE_URL_UNPOOLED` at it only as a
deliberate, owner-approved production change. Never restore over the live `main` branch
directly.

**Into a local database (inspection only).** Use a PostGIS-enabled Postgres 18:

```sh
docker run -d --name kidease-restore -e POSTGRES_PASSWORD=local -p 5433:5432 postgis/postgis:18-3.6
createdb -h localhost -p 5433 -U postgres kidease
pg_restore --no-owner --no-privileges -h localhost -p 5433 -U postgres -d kidease ./db.dump
```

A few errors about Neon-only roles or extensions are expected; check the tables you need.
Treat local copies as personal data (Law 25 / PIPEDA): delete them when done.

## Cost

Pennies. R2 Standard storage is $0.015/GB-month with the first 10 GB/month free, and
egress is free. ~4 weekly + ~13 monthly dumps of a few hundred MB compressed is
well under the free tier today. GitHub Actions minutes are free on the public repo.
The only Neon cost is the brief extra compute while `pg_dump` reads the database.

## The old in-app backup job stays OFF

`src/lib/server/automation-backup.ts` (Vercel cron `/api/automations?job=neon-backup`)
is superseded by the GitHub workflow. Keep `FEATURE_NEON_BACKUP=0` and
`FEATURE_NEON_BACKUP_LIVE=0`: it needs `pg_dump`, which Vercel functions don't have,
caps dumps at 200 MB, and would write into the public `kidease-media` bucket.
