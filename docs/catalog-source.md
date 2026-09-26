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

The private 23 927-row master lives in
[kidease-master-data](https://github.com/klernout-hash/kidease-master-data).
Do not commit it here. `POST /api/seed-catalog` only upserts `centres.json`
(+ extras). It cannot see the private file. Close the master gap with the
ops script.

```bash
# Prove the lock before writing. No DATABASE_URL. Prints counts only.
MASTER_CSV_PATH=/secure/KidEase_Canada_Master_23927_20260923_1004.csv \
npm run ops:seed-catalog -- --dry-run --expect-master=23927

# One Production write after migrations. Idempotent.
MASTER_CSV_PATH=/secure/KidEase_Canada_Master_23927_20260923_1004.csv \
DATABASE_URL='postgresql://…' \
npm run ops:seed-catalog
```

What the merge does:

- Every existing catalogue row stays. The script throws if the row count shrinks.
- A master row does not create a second listing when the normalized licence
  matches in that province, or when the normalized name, street number, and
  street name match and the city or postal area also matches. A shared name
  is not enough.
- Blank phone / email / website are filled from the master. A filled value is
  never replaced with blank.
- Unmatched Canada rows are appended only when a coordinate already exists for
  that postal code, FSA, or city (catalogue median, or the built-in city list).
  Rows with no coordinate are counted as `skippedNoGeo` and are not given an
  invented pin.
- Ages, fees, photos, open spots, and Live/claim fields are not copied from
  the CSV. New rows stay unclaimed (`claim_status` default `unclaimed`), so
  they are catalogue listings, not Live centres.
- The upsert still skips any row with `claimed_at`, a provider link, a claim,
  or a staff membership. Kids World and other approved centres are left as
  they are.
- On a real write, a new master row that already exists in Neon under another
  id is not inserted again. That match is the same normalized licence in the
  province, or the same normalized name with the same street number and street
  name and the same city or postal area. A shared name is not enough.

Deploy this change before the Production seed. The listing sitemap keeps the
bundled slug file and unions public Neon slugs, so the new rows show up on
www after the seed without committing the CSV. Ghost / TEST fixtures stay off
the public sitemap.

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

## Duplicate listings

Migration `0062_listing_merge.sql` adds `merged_into` and `import_fault`.
A Vercel deploy runs it from `npm run build` when `DATABASE_URL` is set.
Do not run the merge against Production before that migration is applied.
Do not delete a daycare row. Child tables cascade on delete.

The groups file is the audit export (`duplicate-groups-20260926.json`).
Keep it off git. Dry-run first. `--apply` writes a backup and a guarded
rollback SQL under `tmp/merge-duplicates/` before it opens the transaction.

```bash
# Counts only. No DATABASE_URL, no writes.
npm run ops:merge-duplicates -- --groups /secure/duplicate-groups-20260926.json

# Read Production facts. Still no writes.
DATABASE_URL='postgresql://…' \
npm run ops:merge-duplicates -- --groups /secure/duplicate-groups-20260926.json

# Write after the counts look right. Prints the backup path, not contact values.
DATABASE_URL='postgresql://…' \
npm run ops:merge-duplicates -- --groups /secure/duplicate-groups-20260926.json --apply
```

A shared name is not a match. Kids & Company at two addresses stays two
listings, and 230 Jane St does not merge into 232 Jane St. A row matches
only when the normalized licence is the same in that province, or when the
normalized name, street number, and street name match and the city or the
postal area (the first three characters of the postal code) also matches.
`240 Avenue Rd` and `240 Avenue Road` are the same street. A civic number
and a highway address match when the licence number is the same.

The keeper is the claimed listing, then the one with enquiries, leads, or
messages, then photos, then the most complete ages, fees, and description,
then the oldest row. Blank website, contact email, phone, and postal code
are filled from the retired row. A filled value is left as it is.
`license_status` is not copied. The keeper's licence number is normalized
(`MB-1276` to `1276`) and the existing Manitoba local licence check runs again.

Admin shows a retired row as **Merged into** the keeper, with Un-merge.
That action clears `merged_into` and does not delete either row.

## Prince Edward Island names

Some `mx-` rows store `City, PE A1A 1A1` in the name column. The master CSV
is not in this repo. When `facility_name` (or the same aliases the sync uses)
is a real centre name, the repair copies it. Otherwise the row is hidden
with `import_fault = pei_name_unrecoverable` and `listing_active = 0`.
The script lists those ids. It does not invent a name from the city.

```bash
# Repo has no master file, so this lists rows and recovers nothing.
DATABASE_URL='postgresql://…' \
npm run ops:repair-pei-names

# Recover only the names present in the private master. Then hide the rest.
DATABASE_URL='postgresql://…' \
MASTER_CSV_PATH=/secure/KidEase_Canada_Master_23927_20260923_1004.csv \
npm run ops:repair-pei-names -- --apply
```
