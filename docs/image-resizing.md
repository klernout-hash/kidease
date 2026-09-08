# Listing photo transforms (Cloudflare + R2)

Serve **resized** Explore cards and listing-detail heroes from the photos
already on R2. No second bucket. No Cloudflare Images upload. Catalogue
paths stay `/photos/…`.

Originals stay exactly where they are:

```
https://media.kidease.ca/photos/buildings/mb-1001.jpg
```

When Kyle turns the flag on, cards and heroes request a same-host transform:

```
https://media.kidease.ca/cdn-cgi/image/width=320,quality=75,format=auto,fit=scale-down/photos/buildings/mb-1001.jpg
```

`format=auto` picks AVIF / WebP from `Accept`. `fit=scale-down` never
upsizes a small original. Widths are the existing allow-list
`320 / 480 / 768 / 1200`.

| Surface | CSS size (approx) | `srcset` widths |
| --- | --- | --- |
| Explore / search cards | 172–200px (`CARD_SIZES`) | 320, 480, 768 |
| Listing detail hero | 100vw / 720px (`DETAIL_SIZES`) | 480, 768, 1200 |

Leave the flag **unset** so cards use same-origin `/img?src=&w=` (AVIF /
WebP from `Accept`, widths `320 / 480 / 768 / 1200`). Original R2 URLs
stay valid at `https://media.kidease.ca/photos/…` and are the `onError`
fallback. `/cdn-cgi/image/` is only requested when the flag is on.

## Why not Cloudflare Images (hosted)

Hosted Images would re-upload every JPEG to `imagedelivery.net`. Photos
are already on `kidease-media` behind `media.kidease.ca`. Image
**Transformations** (the `/cdn-cgi/image/` URL) resize those objects in
place. No API token in the app. No id remap.

## Cloudflare dashboard (Kyle)

Do this **before** setting the Vercel flag. A transform URL 404s if the
zone cannot run Transformations.

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → zone **kidease.ca**
   (the zone that owns `media.kidease.ca`).
2. **Images** → **Transformations** (older UI: Speed → Optimization →
   Image Resizing). Enable transformations for the zone.
3. Allowed source: **same zone** is enough. Do not add
   `*.r2.cloudflarestorage.com`. The public objects are already
   `https://media.kidease.ca/photos/…`.
4. Confirm the R2 custom domain `media.kidease.ca` is still attached to
   bucket `kidease-media` and proxied. Do not change the object keys.
5. Smoke-test in a private window (not committed):

   ```
   https://media.kidease.ca/cdn-cgi/image/width=320,quality=75,format=auto,fit=scale-down/photos/wpg/1001.jpg

   Compare with the original, which must keep working:

   https://media.kidease.ca/photos/wpg/1001.jpg
   ```

   Expect an image, not an HTML error. The original without `/cdn-cgi/image/`
   must still load.
6. If `/cdn-cgi/image/` 404s on the R2 custom domain, keep the Vercel flag
   **off**. Transformations have to be enabled on that hostname (or a
   Worker on `media.kidease.ca`) before the app should request them.
   Do not invent a second public host in git.

No Images API token. No Account ID in the app. Do not add a Cloudflare
token env for this — Transformations are a dashboard toggle, not a key.

## Vercel env

Set the same pair on **Production + Preview** after step 5 works.
Redeploy so Vite inlines the client flag (`VITE_` is required in the
browser bundle).

| Name | Value | Notes |
| --- | --- | --- |
| `R2_PUBLIC_BASE_URL` | `https://media.kidease.ca` | Already required for public photos. |
| `VITE_R2_PUBLIC_BASE_URL` | `https://media.kidease.ca` | Same origin, client. |
| `CF_IMAGE_RESIZE` | `1` | Server / SSR. Leave blank or `0` to keep `/img` + original fallback. |
| `VITE_CF_IMAGE_RESIZE` | `1` | Client. Must match `CF_IMAGE_RESIZE`. |

Names only in `.env.example`. Never commit real values.

## Fallback

- Flag unset / `0` / `false` → same-origin `/img?src=&w=` (AVIF/WebP, sized).
  `/img` reads private R2 originals, then Git, then the public
  `https://media.kidease.ca/photos/…` object. Catalogue paths stay `/photos/…`.
- Flag on + `media.kidease.ca` → `/cdn-cgi/image/width=…,format=auto/…`.
- Flag on but public base missing → `/img?src=&w=` (Git / R2 dual-read).
- Flag on + `*.r2.dev` public base → `/img?src=&w=` (no `/cdn-cgi/` on r2.dev).
- Browser `onError` on `/img` or a transform URL → original
  `https://media.kidease.ca/photos/…` URL, then the storefront placeholder.
  Cards do not stay broken if `/img` misses or Kyle enables the CF flag early.
- Distinct listing IDs must not share identical JPEG bytes unless that hash is
  listed in `INTENTIONAL_SHARED_PHOTO_SHA256` (same-site programs). Unflagged
  copies — including the Portage &amp; Main street-view on `/photos/wpg/2121.jpg`,
  `2029.jpg`, and `101693.jpg` — are remapped by `listingPhotosFor` / `photoUrl`
  to the official storefront placeholder, or to a unique `/photos/wpg/` asset
  when one exists. `/img` hashes the original it actually read (R2 / Git /
  media). If that hash is an unflagged shared fallback it encodes a
  **per-listing** placeholder (`x-kidease-photo: per-listing-placeholder`)
  instead of the copied street-view. The official `storefront-placeholder`
  path stays a flagged shared asset.

Home How-it-works stills (`cottage.jpg`, `kitchen.jpg`) ship pre-encoded
AVIF/WebP at 768 and 1200 (`scripts/encode-feel-photos.mjs`). Hero and
playroom already have 1200 variants. Re-run the encoder after replacing a
source JPEG.

`real-storefronts.json` / `storefronts.json` keep the scrape maps.
`listingPhotosFor` applies the honesty overlay and does not invent new
id→path assignments. Do not delete `public/photos`.

## See also

- `scripts/r2-public-photos.md` — sync keys to R2
- `scripts/r2-photo-migrate.md` — private `originals/…` + `/img`
