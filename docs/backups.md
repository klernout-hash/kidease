# Database backups

This page describes the backup job that is already in the repo. It does not change that job. A separate cost review of Neon is underway, so the schedule, the dump, and the flags stay as they are.

## What runs today

The job is `neon-backup` in `src/lib/server/automation-backup.ts`. It is also listed in `docs/automations.md`.

- `FEATURE_NEON_BACKUP` defaults **off**. With the flag off, the job returns `flag_off` and does not dump.
- `FEATURE_NEON_BACKUP=1` without `FEATURE_NEON_BACKUP_LIVE=1` is a dry run. It logs the object key and does not upload.
- `FEATURE_NEON_BACKUP_LIVE=1` (with the flag on, and not a dry-run request) runs `pg_dump --format=custom` and uploads the file.
- The job runs on Sunday in `America/Winnipeg`, unless `force` is set. Vercel cron is `30 8 * * 0` UTC. Inngest is `30 2 * * 0` in `America/Winnipeg`. Both call `/api/automations?job=neon-backup`.
- The object key is `backups/neon/YYYY-MM-DD.dump` in the R2 backup path. The code rejects any key that does not start with `backups/neon/`.
- After the dump, the job runs `pg_restore --list` and checks that the list looks like a Postgres archive. It then checks the uploaded object size matches the file.
- A dump that is empty, or larger than 200 MiB (`200 * 1024 * 1024` bytes in `automation-backup.ts`), is marked failed and is not uploaded.
- Failure is recorded on the automation run. This page does not turn on ops email. See `FEATURE_OPS_ALERTS` in `docs/automations.md`. That flag is also off by default.

The job does not print `DATABASE_URL`. It does not change subscriptions.

## What this repo does not set

Neon’s own point-in-time product is not configured in this repository. This file does not state a Neon retention window, because that number is not in the code.

Do not set `FEATURE_NEON_BACKUP` or `FEATURE_NEON_BACKUP_LIVE` from this document. Kyle turns those on after the Neon cost review, using the rollout in `docs/automations.md`.
