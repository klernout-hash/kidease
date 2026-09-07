# Public R2 listing photos

Serve catalogue `/photos/…` files from the public r2.dev host **without
changing id→path maps**. `listingPhotosFor` still reads `real-storefronts.json`
then `storefronts.json`.

| Source | Path kept in catalogue | Object key in `kidease-media` |
| --- | --- | --- |
| Official building | `/photos/buildings/{id}.jpg` | `photos/buildings/{id}.jpg` |
| Winnipeg storefront | `/photos/wpg/N.jpg` | `photos/wpg/N.jpg` |

Public base (not a secret):

```
https://pub-9e5f137809844fcdb6d6671cd909f312.r2.dev
```

When `R2_PUBLIC_BASE_URL` or `VITE_R2_PUBLIC_BASE_URL` is set, `publicPhotoUrl`
prefixes those same paths:

```
/photos/buildings/mb-1001.jpg
  → https://pub-9e5f137809844fcdb6d6671cd909f312.r2.dev/photos/buildings/mb-1001.jpg
```

Leave both unset to keep same-origin `/photos/…` (Git `public/photos` fallback).
**Do not delete `public/photos` in this change.**

This is separate from the private `originals/…` migrate (`scripts/r2-photo-migrate.md`
and `/img` dual-read). Public delivery uses the `photos/…` key prefix so the
r2.dev URL matches the catalogue path.

## Sync (env-based, no hardcoded secrets)

Requires the AWS CLI and R2 S3 API credentials. Names only in git:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT` or `R2_ACCOUNT_ID`
- `R2_BUCKET` (defaults to `kidease-media`)

```bash
# pull Production env locally — do not commit
npx vercel env pull .env.production.local --environment production --yes
set -a && . ./.env.production.local && set +a

npm run photos:sync-r2
# prints: aws s3 sync public/photos s3://kidease-media/photos --endpoint-url … --dryrun

npm run photos:sync-r2 -- --apply
```

Equivalent once env is loaded:

```bash
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
aws s3 sync public/photos "s3://${R2_BUCKET:-kidease-media}/photos" \
  --endpoint-url "$R2_ENDPOINT" \
  --region auto
```

`--apply` is required to write. Dry-run never uploads. Re-runs are incremental.

## App env (Vercel)

Set the same public origin on Production + Preview (not a secret):

- `R2_PUBLIC_BASE_URL`
- `VITE_R2_PUBLIC_BASE_URL`

CSP `img-src` already allows that host and `https://*.r2.dev`.
The S3 API host (`*.r2.cloudflarestorage.com`) stays off the browser allowlist.

## Secrets

Never commit `.env`, `.env.production.local`, or real `R2_*` values.
`.env.example` lists names only.
