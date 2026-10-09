# KidEase Canada master CSV

The licensed-childcare master is **not** stored in this public app repo (phones/emails).
Do not commit the CSV.

## Current master — 2026-10-06

- Rows: **25,872** (do not shrink this file)
- File: `KidEase_Canada_Master_25872_20261006_1314.csv`
- Private. It stays on Drive and in the private master repo. It is not public.
- Quebec recognized home daycares (milieux familiaux reconnus / RSG) are **not** in this master. They stay in their own import.

Public catalogue measured on 2026-10-09, before the seed below has been run:

| Surface | Listing URLs |
| --- | ---: |
| Sitemap `sitemap-listings-1.xml` … `6.xml` | 25,617 |
| City directory (same provinces, same total) | 25,617 |
| Master | 25,872 |
| Still to publish | 255 |

The city directory matches the sitemap, so the 255 are not a sitemap-length filter. They are licensed master rows that are not public yet. The older 23,927-row file is 1,945 rows smaller than this master. The live site is 1,690 above that older file. `1,945 − 1,690 = 255`.

This checkout cannot run the production seed: there is no production `DATABASE_URL` here, and the 14,410,659-byte CSV is over the Drive download limit. The live count stays 25,617 until the commands below succeed.

```bash
MASTER_CSV_PATH=/secure/KidEase_Canada_Master_25872_20261006_1314.csv \
npm run ops:seed-catalog -- --dry-run --expect-master=25872

MASTER_CSV_PATH=/secure/KidEase_Canada_Master_25872_20261006_1314.csv \
DATABASE_URL='postgresql://…' \
npm run ops:seed-catalog -- --expect-master=25872
```

Read the dry-run line first. Every master row must be `matched`, `added`, `skippedNoGeo`, `skippedNonCanada`, `skippedQcHome`, or `skippedInvalid`. `catalogueRows` must be at least 25,872. If the lock throws, paste that summary and stop. Do not hide rows to force the number.

What the seed does with this file:

- Inserts licensed rows that are not already in the catalogue when a coordinate exists.
- After the catalogue postal, FSA, city, and built-in city list miss, a real postal code uses the official postal-area centre (GeoNames, CC BY 4.0). That is not a street pin.
- A row with no postal code stays `skippedNoGeo`. It is not invented.
- A Quebec recognized home in the file is `skippedQcHome` and is not inserted. CPE and garderie stay. BC and Alberta family homes stay.
- Does not turn on `FEATURE_PUSH` or `FEATURE_QC_HOME_DAYCARES`.
- An `mx-` row hidden as `removed_from_master` is made public again when its facility is in this master (cap 500). Claimed rows stay as they are.

## Previous snapshot — 2026-09-08

- Rows: 23,927
- Phones: 15,405
- Emails: 13,668
- Websites: 3,781
- Private GitHub: https://github.com/klernout-hash/kidease-master-data file `KidEase_Canada_Master_23927_20260908.csv`
- Enrichment log `found_20260908.jsonl` + GHL email-only / remainder zips also in that private repo

## Frozen snapshot — 2026-09-02

- Rows: 23,927
- Phones: 19,005
- Emails: 13,976
- Websites: 9,333

## Where it lives

- Private GitHub repo: https://github.com/klernout-hash/kidease-master-data
- Google Drive: https://drive.google.com/file/d/1kOX8R-odlw1stQ-LIylhid8PQwkEF5xf/view
- File name: `KidEase_Canada_Master_23927_20260902.csv`

To push the full 10 MB CSV from a laptop after downloading Drive:

```bash
git clone https://github.com/klernout-hash/kidease-master-data.git
cd kidease-master-data
cp ~/Downloads/KidEase_Canada_Master_23927_20260902.csv .
git add KidEase_Canada_Master_23927_20260902.csv
git commit -m "Add frozen master 2026-09-02 (23927 rows, 19005 phones)"
git push
```

## Seed Production (public catalogue → Neon)

Use the 25,872 commands at the top of this file. The block below is the
September 23,927 snapshot only.

The public app ships `centres.json` (~20 846 licensed rows, no master emails).
`centres-extra-2.json` … `centres-extra-5.json` were never committed, so the
3 341 master-only rows from the September merge are not in git. Neon is the
runtime source of truth after upsert. Do **not** commit this CSV and do **not**
run the seed on `npm run build`.

September dry-run (no database), then one write against that older file:

```bash
MASTER_CSV_PATH=./KidEase_Canada_Master_23927_20260923_1004.csv \
npm run ops:seed-catalog -- --dry-run --expect-master=23927

MASTER_CSV_PATH=./KidEase_Canada_Master_23927_20260923_1004.csv \
DATABASE_URL='postgresql://…' \
npm run ops:seed-catalog
```

Existing rows are kept. Filled phone / email / website are never blanked.
Unmatched Canada rows are inserted when a postal, FSA, or city coordinate
already exists. Ages, fees, photos, and Live/claim state are not invented.
Claimed and provider-owned rows are not overwritten.

`POST /api/seed-catalog` only upserts the JSON catalogue. It does not read
this CSV. See `docs/catalog-source.md`.
