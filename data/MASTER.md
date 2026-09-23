# KidEase Canada master CSV

The 23,927-row licensed-childcare master is **not** stored in this public app repo (phones/emails).

## Current snapshot — 2026-09-08

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

The public app ships `centres.json` (~20 846 licensed rows, no master emails).
`centres-extra-2.json` … `centres-extra-5.json` were never committed, so the
3 341 master-only rows from the September merge are not in git. Neon is the
runtime source of truth after upsert. Do **not** commit this CSV and do **not**
run the seed on `npm run build`.

Dry-run (no database), then one Production write:

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
