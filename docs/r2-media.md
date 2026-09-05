# Listing photos → Cloudflare R2

Private bucket **`kidease-media`** (Western North America). Vercel Production already has `R2_*`. This repo still serves Git files under `public/photos/…`. Do not delete those until a later PR.

## What shipped

| Surface | Behaviour |
|---|---|
| Catalogue / DB | Paths stay `/photos/wpg/1052.jpg`, `/photos/buildings/mb-1052.jpg`, … |
| `/img?src=/photos/…` | Prefer R2 object `photos/…` when `R2_*` is set; fall back to `public/photos/…` |
| Static `/photos/…` | Still Git (Vercel public assets). Logos and placeholders that skip `/img` stay on Git |
| `/api/admin/media` | Unchanged admin put/get/presign (PR #30) |
| Git `public/photos/` | **Not deleted** |

Set `R2_MEDIA_READ=0` on Vercel if you need to pause R2 listing reads without removing credentials.

## Object key convention

Git path `public/photos/<rest>` ↔ R2 key `photos/<rest>`.

```
public/photos/buildings/mb-1052.jpg  →  photos/buildings/mb-1052.jpg
public/photos/wpg/1052.jpg           →  photos/wpg/1052.jpg
public/photos/wpg/3001-logo.png      →  photos/wpg/3001-logo.png
```

Admin-only keys such as `originals/mb-1009.jpg` stay on `/api/admin/media`. They are not listing thumbs.

## Migrate (Kyle — Production secrets)

Cloud agents cannot see Vercel Production env. Run this on a laptop or CI secret store that already has `R2_*`:

```bash
# names only — pull values from Vercel → Project → Settings → Environment Variables
# R2_ACCOUNT_ID
# R2_BUCKET=kidease-media
# R2_ACCESS_KEY_ID
# R2_SECRET_ACCESS_KEY
# R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com

export R2_ACCOUNT_ID=…
export R2_ACCESS_KEY_ID=…
export R2_SECRET_ACCESS_KEY=…
export R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
# optional
export R2_BUCKET=kidease-media

npm run media:migrate-r2
# inspect the dry-run, then:
npm run media:migrate-r2 -- --apply
# official buildings first (smallest batch):
npm run media:migrate-r2 -- --apply --prefix photos/buildings
```

Re-runs HEAD each key and skip objects that already exist. The script never deletes Git files.

## Success criteria

1. With `R2_*` unset (local / Preview without keys), `/img` still serves Git photos. Listings look the same.
2. After `--apply` on Production, `/img?src=/photos/buildings/mb-1052.jpg` returns `x-kidease-photo-source: r2` for that file (or `cache` on a warm hit).
3. A missing R2 object falls back to Git (or 404 if Git also lacks it). `BuildingPhoto` still shows the placeholder on error.
4. `GET /api/admin/media` (signed-in admin, same-site) still reports `{ configured, bucket }` without secrets.
5. Repo contains no R2 tokens, no `r2.dev` public URL, and `public/photos/` is still present.

## Follow-up (not this PR)

- Confirm Production upload, then consider deleting Git originals in a dedicated PR.
- Provider upload UI writing straight to R2.
- Cloudflare Images / variants instead of on-box Sharp once originals live in R2.
