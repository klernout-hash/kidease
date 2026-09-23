# Listing photo polish

When a daycare uploads a storefront or interior photo, KidEase straightens it, makes it a bit sharper, and frames the building or logo before the listing is saved. Admin can run the same step again on photos that centre already uploaded.

Catalogue files under `/photos/…`, licence scans, and screening documents are not processed.

## What runs

No extra API key is required.

1. The file must decode. If sharp cannot read it, the save fails with an error and the previous photo stays in place.
2. EXIF orientation is applied.
3. A small search rotates the photo so walls and horizontal lines sit on the axes (about ±12°).
4. The subject is cropped toward the centre at a 4:3 frame when it is sitting in a corner or surrounded by empty margin. A photo that already fills the frame is not cropped tighter.
5. A mild unsharp mask is applied. The stored file is JPEG, longest edge 1600px, under the 1.8 MB listing cap.

If that enhance step throws after the file decoded, the **original upload is kept** and the save still succeeds. The parent never gets a broken image from a failed sharpen.

## Optional vision hook

Set both of these on the server (Vercel, never `VITE_`) to ask an HTTPS endpoint for a rotation and crop before the deterministic pass. Leave them unset to skip the network entirely.

```
LISTING_PHOTO_VISION_URL=
LISTING_PHOTO_VISION_KEY=
```

`POST` JSON:

```json
{ "task": "listing-photo-frame", "mime": "image/jpeg", "imageBase64": "…" }
```

Response fields that are used:

```json
{
  "angleDeg": -3.5,
  "crop": { "left": 0.08, "top": 0.05, "width": 0.84, "height": 0.8 }
}
```

`angleDeg` is clockwise degrees, the same direction as `sharp.rotate`, clamped to ±15. `crop` is fractions of the image (0–1). A missing key, a non-HTTPS URL, or a failed call is logged and the deterministic deskew still runs. Only the image the centre uploaded for the listing is sent.

## Again, for a centre that already uploaded

Admin → the centre’s review card → **Straighten photo** (shown when the storefront on file is a centre upload). That does not approve the listing or change Live. It is a routine desk edit: after one password confirm it stays unlocked for 20 minutes (`ADMIN_REAUTH_GRACE_DEFAULT_MS` in `src/lib/reauth.ts`, overridable with `ADMIN_REAUTH_GRACE_MS`). Approve → Live keeps the 10-minute step-up and is not covered by that grace.

Or, for any slug:

```
DATABASE_URL=… node --experimental-strip-types scripts/reprocess-listing-photos.mjs --slug kids-world-daycare-kh2t
```

`--id` selects by daycare id. `--dry-run` prints counts and does not write. The slug above is an example, not a hardcoded centre.
