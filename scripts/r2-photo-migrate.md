# R2 photo migrate (one-shot)

Copy Git listing originals into the private Cloudflare R2 bucket `kidease-media`
(Western North America). **Do not delete `public/photos` in the same change.**
`/img` already dual-reads: R2 when `R2_*` is set, then Git / public paths.

This environment cannot see Vercel Production secrets. Kyle (or CI with those
env vars) runs `--apply` once.

## Inventory (2026-09-05, this repo)

Hypothesis confirmed: listings keep `/photos/…` static paths. Cards go through
`BuildingPhoto` → `photoUrl()` → `/img?src=/photos/…`.

| Location | Files | Role |
| --- | ---: | --- |
| `public/photos/wpg/` | 785 | Winnipeg storefront JPEGs + logos (`storefronts.json`) |
| `public/photos/buildings/` | 22 | Official operator JPEGs (`real-storefronts.json`) |
| `public/photos/storefront/` | 12 | Extra mapped storefronts (`storefronts.json`) |
| `public/photos/` (root) | 14 | Marketing / fallbacks (`community.jpg`, placeholders, playroom) |
| `public/photos/team/` | 2 | `/team` portraits |
| **Total** | **835** | **~74 MB; all under the 4 MB R2 object cap** |

Listing JSON:

- `src/lib/data/storefronts.json` — 711 `/photos/wpg/…` or `/photos/storefront/…` paths; **all 711 files exist**.
- `src/lib/data/real-storefronts.json` — 65 `/photos/buildings/{id}.jpg` mappings; **22 on disk, 43 mapped IDs still missing** (BuildingPhoto shows the placeholder). Migrate uploads only files that exist.

Hardcoded `/photos/…` fallbacks (login, team, cottage, playroom) stay on Git until a later cleanup.

Key mapping:

```
/photos/wpg/1001.jpg            → originals/wpg/1001.jpg
/photos/buildings/mb-1014.jpg   → originals/buildings/mb-1014.jpg
/photos/storefront/mb-1043.jpg  → originals/storefront/mb-1043.jpg
/photos/team/kyle-lernout.jpg   → originals/team/kyle-lernout.jpg
/photos/community.jpg           → originals/community.jpg
```

The bucket stays private. Browsers never get R2 keys. `/img` signs GET on the
server. `/api/admin/media` remains admin-only put/get.

## Refresh inventory

```bash
npm run photos:inventory
# or
node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --inventory
```

`--inventory-full` adds every `src` / `key` / `bytes` row.

## Apply on a machine that has Production env

1. Pull Vercel Production env (names only in git; values stay local):

   ```bash
   npx vercel env pull .env.production.local --environment production --yes
   set -a && . ./.env.production.local && set +a
   ```

   Required names: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
   `R2_ENDPOINT` or `R2_ACCOUNT_ID`. `R2_BUCKET` defaults to `kidease-media`.

2. Dry-run (default):

   ```bash
   npm run photos:migrate-r2
   ```

3. Smoke one building JPEG, then the rest:

   ```bash
   node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --apply --only buildings --limit 1
   node --experimental-strip-types scripts/migrate-photos-to-r2.mjs --apply
   ```

   Re-runs skip keys that already exist unless you pass `--force`.

4. Confirm Production `/img?src=/photos/buildings/mb-1014.jpg&w=480` still
   returns an image (R2 hit or Git fallback). Admin `GET /api/admin/media?key=originals/buildings/mb-1014.jpg`
   should 200 for a signed-in admin.

5. Optional until this migrate finishes: set Vercel `R2_READ_ORIGINALS=0` so
   `/img` stays on Git and does not 404-probe R2. Unset or `1` after the upload.

6. **Do not delete Git photos yet.** After a week of dual-read on Production,
   a follow-up PR can drop `public/photos` binaries.

## Privacy

This PR does not change where Production *stores* photos until `--apply` runs.
Privacy processor copy is unchanged. After originals live in R2 and `/img`
reads them in production, add Cloudflare R2 (private `kidease-media`, Western
North America) to the privacy processor list.

## Secrets

Never commit `.env`, `.env.production.local`, or real `R2_*` values.
`.env.example` lists names only.
