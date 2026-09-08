# Licensed catalogue source of truth

Neon Postgres (`daycares`) is the runtime source of truth once a national
catalogue is present. `centres.json` + `centres-extra-*.json` stay in the repo
as the seed input and as a cold fallback when Neon is empty or unreachable.

## Production seed

Do **not** seed 20k rows during `npm run build` / Vercel deploy. Migrate as usual,
then seed once (or resume) against the Production `DATABASE_URL`.

```bash
# Laptop / ops box with Production DATABASE_URL (Neon dashboard or `vercel env pull`).
DATABASE_URL='postgresql://…' npm run ops:seed-catalog
```

Resume after a pause:

```bash
DATABASE_URL='postgresql://…' npm run ops:seed-catalog -- --resume
```

Or chunk from Vercel (header secret only — never `?secret=`):

```bash
curl -X POST https://www.kidease.ca/api/seed-catalog \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"offset":0,"limit":200}'
```

Repeat with the returned `nextOffset` until `done` is true. Each call upserts
one chunk so the function stays under the serverless time budget.

The upsert is idempotent. Claimed listings (`claimed_at`) are never overwritten.
Filled `phone`, `contact_email`, and `website` are never replaced with blank.

Licence verification (Manitoba local snapshot, no scrape) is documented in
[licensing.md](./licensing.md). The Licensed badge is derived at read time from
`license_number` + the bundled MB index, and optionally persisted on seed.

## When runtime prefers Neon

- `CATALOG_SOURCE=auto` (default): Neon when public `daycares` ≥ 10 000.
- `CATALOG_SOURCE=neon`: Neon as soon as at least one public row exists.
- `CATALOG_SOURCE=json`: always JSON (debug / emergency).
- `NEON_CATALOG_MIN_COUNT` overrides the auto threshold.

Nearby / search use PostGIS `ST_DWithin` and do not load `centres.json` on hits.
When Neon is the SoT, an empty radius is trusted (no JSON sweep).

Listing photos still come from `listingPhotosFor` + `real-storefronts.json` /
`storefronts.json` at hydrate/seed time. This path does not invent id↔photo maps
and does not change R2 wiring.

Admin → Daycares shows the live SoT (Neon vs JSON fallback) and the public row count. That banner never treats Drive / Git CSV as runtime truth.

## Optional master CSV (offline only)

The private 23 927-row master (phones / emails / websites) lives in
[kidease-master-data](https://github.com/klernout-hash/kidease-master-data).
Do not commit it here.

```bash
MASTER_CSV_PATH=/secure/KidEase_Canada_Master_23927_20260902.csv \
DATABASE_URL='postgresql://…' \
npm run ops:seed-catalog
```

Enrichment is blank-only. Existing catalogue or operator contacts win.

## QA / ghost fixtures

`centres-extra-1.json` and migration `0022_listing_visibility.sql` keep one
claim-lab row (`TEST Ghost Claim Lab`, `ke-test-ghost-001`) for local and
Preview. That row is **never** a public daycare.

- Public Explore, search, map, listing detail, sitemap, search alerts, and
  parent claim search drop fixtures via `isAdminOnlyListing` and
  `PUBLIC_LISTING_SQL` (flags **plus** `TEST ` name prefix, `ke-test-` ids,
  `TEST-` licences, ghost-claim copy, KidEase Test Lane).
- Production seed (`VERCEL_ENV=production` or `NODE_ENV=production` outside
  Preview) skips those rows. Override with `ALLOW_TEST_LISTINGS=1` only on
  local / Preview claim-lab.
- Admin still lists them with a **QA test** badge.

### Ops: leftover production rows

Deploy applies `0039_hide_test_fixtures.sql`, which sets
`visibility = 'admin_only'` and `is_test = 1` on matching leftovers. Rows stay
invisible on www even if that migration has not run yet (query filter).

Inspect:

```sql
select id, slug, name, visibility, is_test
from daycares
where is_test = 1
   or visibility = 'admin_only'
   or name like 'TEST %'
   or id ilike 'ke-test-%';
```

Optional delete (only if Admin should not see them either; watch FKs on
`listing_claims` / `provider_daycares`):

```sql
delete from daycares
where id ilike 'ke-test-%'
   or slug ilike 'test-ghost-%';
```
