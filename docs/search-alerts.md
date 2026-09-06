# Saved search alerts (PR C)

Parents save a search (origin + radius + age band + filters) and get notified when a matching centre appears in that radius, or when a centre in the radius reconfirms vacancy.

This is email + in-app scaffolding. **It does not send FCM / APNs.** `FEATURE_PUSH` stays off-by-default.

## What landed

- Parent can **save / list / edit / delete** searches from `/search` and the Family desk → Search alerts.
- **Alert prefs** (email and/or in-app) persist on `search_alert_prefs`.
- Matching uses the same PostGIS `ST_DWithin` + `st_makepoint(lng, lat)` pattern as `nearby.ts`. Origins are the lat/lng the parent already used in search. **KidEase never invents coordinates.**
- Cron stub `GET|POST /api/search-alerts` (same `CRON_SECRET` / `DIGEST_SECRET` as `/api/digest`) logs candidates. First pass baselines without notifying.

## Migration `0028_saved_search_alerts.sql`

Applied on deploy by `npm run db:migrate` (`scripts/migrate.mjs`) when `DATABASE_URL` is set. PGLite preview applies the same file at startup (it is not PostGIS — no `CREATE EXTENSION`).

| Table | Purpose |
| --- | --- |
| `saved_searches` | Named search: `center_lat` / `center_lng` / `center_label` (from live search), `radius_km` (1–50), `age_band`, `filters` JSONB (includes PR #59 honesty chips), `alerts_enabled`, `last_checked_at` |
| `search_alert_prefs` | Per-user `email_enabled` + `in_app_enabled` |
| `search_alert_notices` | In-app family-desk notices (`new_centre` \| `vacancy_reconfirmed`) |
| `search_alert_candidates` | Job log / dedup. First check inserts a baseline (`notified = 0`) |

No new geography column. Matching reads `daycares.location` from `0011_listing_geography.sql`.

## Filters stored

`filters` JSONB mirrors `/search` chips, including PR #59 when present:

`avail`, `liveOnly`, `ten`, `meals`, `outdoor`, `inclusive`, `extended`, `infantOnly`, `catchmentOnly`, `confirmedOnly`, `readyOnly`, `claimVerifiedOnly`.

## Job

`runSearchAlertJob()` in `src/lib/server/search-alerts.ts`:

1. Load enabled saved searches.
2. Skip rows with invalid origin (do not fall back to Winnipeg or any default).
3. Query public centres in radius via `SEARCH_ALERT_MATCH_SQL` (PostGIS) or a lat/lng fallback that still uses the saved origin.
4. Apply age band + stored filters.
5. First run: write candidates, no notify.
6. Later runs: `new_centre` (not seen before) and `vacancy_reconfirmed` (`last_vacancy_updated_at` after `last_checked_at`).
7. In-app insert when prefs allow. Email via Resend/SendGrid when those keys exist.

```
TODO: when RESEND_API_KEY is missing, sendSearchAlertEmail stubs (logs) and still persists the preference.
```

Vercel cron (hourly):

```json
{ "path": "/api/search-alerts", "schedule": "20 * * * *" }
```

Authorize with `Authorization: Bearer $CRON_SECRET` or `?secret=`. `?dryRun=1` logs without writing notices or sending mail.

## Out of scope

Live push, SMS, in-app chat, desk switcher, Stripe, Facebook, trust badges.
