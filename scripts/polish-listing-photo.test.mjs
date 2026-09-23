import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  ListingPhotoPolishError,
  isCentreUploadedImageDataUrl,
  polishListingPhotoDataUrl,
  polishStoredPhotoList,
} from "../src/lib/server/polish-listing-photo.ts";
import { parseReprocessArgs } from "./reprocess-listing-photos.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

async function buildingJpeg({ tilt = 0, shiftX = 0 }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <rect width="100%" height="100%" fill="#f6f3ee"/>
    <g transform="translate(${80 + shiftX} 150) rotate(${tilt} 150 90)">
      <rect width="300" height="180" fill="#1a3790"/>
      <rect x="36" y="36" width="70" height="48" fill="#f4f7fb"/>
      <rect x="130" y="36" width="70" height="48" fill="#f4f7fb"/>
      <rect x="194" y="110" width="48" height="70" fill="#d9e2f2"/>
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

function dataUrl(buf, mime = "image/jpeg") {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function subjectStats(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const dark = (x, y) => {
    const o = (y * w + x) * ch;
    return data[o] < 90 && data[o + 2] > data[o] + 20;
  };
  const rows = [];
  let sx = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    let left = -1;
    for (let x = 0; x < w; x++) {
      if (!dark(x, y)) continue;
      if (left < 0) left = x;
      sx += x;
      n += 1;
    }
    if (left >= 0) rows.push({ y, left });
  }
  const mid = rows.slice(Math.floor(rows.length * 0.3), Math.floor(rows.length * 0.7));
  let tilt = 0;
  if (mid.length > 8) {
    const my = mid.reduce((s, p) => s + p.y, 0) / mid.length;
    const mx = mid.reduce((s, p) => s + p.left, 0) / mid.length;
    let num = 0;
    let den = 0;
    for (const p of mid) {
      num += (p.y - my) * (p.left - mx);
      den += (p.y - my) ** 2;
    }
    tilt = den ? (Math.atan(num / den) * 180) / Math.PI : 0;
  }
  return { cx: n ? sx / n / w : 0.5, tilt, width: w, height: h };
}

test("centre uploads are the only images the polisher accepts", () => {
  assert.equal(isCentreUploadedImageDataUrl("data:image/jpeg;base64,aaaa"), true);
  assert.equal(isCentreUploadedImageDataUrl("data:image/png;base64,aaaa"), true);
  assert.equal(isCentreUploadedImageDataUrl("/photos/buildings/mb-1.jpg"), false);
  assert.equal(isCentreUploadedImageDataUrl("data:application/pdf;base64,JVBERi0"), false);
  assert.equal(isCentreUploadedImageDataUrl("data:image/gif;base64,aaaa"), false);
});

test("a crooked off-centre building is straighter, sharper to decode, and more centred", async () => {
  const input = await buildingJpeg({ tilt: 8, shiftX: -40 });
  const before = await subjectStats(input);
  const result = await polishListingPhotoDataUrl(dataUrl(input), { env: {} });
  assert.equal(result.polished, true);
  assert.equal(result.keptOriginal, false);
  assert.equal(result.sharpened, true);
  assert.equal(result.vision, "off");
  assert.match(result.dataUrl, /^data:image\/jpeg;base64,/);
  const out = Buffer.from(result.dataUrl.split(",")[1], "base64");
  const meta = await sharp(out).metadata();
  assert.ok(meta.width && meta.height);
  const after = await subjectStats(out);
  assert.ok(Math.abs(after.tilt) < 2, `tilt ${before.tilt} -> ${after.tilt}`);
  assert.ok(Math.abs(after.cx - 0.5) < Math.abs(before.cx - 0.5) - 0.08, `centre ${before.cx} -> ${after.cx}`);
});

test("an already-straight photo stays near upright and a second pass does not tilt it", async () => {
  const input = await buildingJpeg({ tilt: 0, shiftX: 0 });
  const once = await polishListingPhotoDataUrl(dataUrl(input), { env: {} });
  const buf = Buffer.from(once.dataUrl.split(",")[1], "base64");
  const mid = await subjectStats(buf);
  assert.ok(Math.abs(mid.tilt) < 1.5, `first tilt ${mid.tilt}`);
  const twice = await polishListingPhotoDataUrl(once.dataUrl, { env: {} });
  const again = Buffer.from(twice.dataUrl.split(",")[1], "base64");
  const after = await subjectStats(again);
  assert.ok(Math.abs(after.tilt) < 1.5, `second tilt ${after.tilt}`);
});

test("enhance failure keeps the original bytes instead of a broken image", async () => {
  const input = await buildingJpeg({ tilt: 6, shiftX: 10 });
  const url = dataUrl(input);
  const result = await polishListingPhotoDataUrl(url, { env: {}, forceEnhanceError: true });
  assert.equal(result.keptOriginal, true);
  assert.equal(result.polished, false);
  assert.equal(result.reason, "enhance-failed");
  assert.equal(result.dataUrl, url);
  const meta = await sharp(Buffer.from(result.dataUrl.split(",")[1], "base64")).metadata();
  assert.equal(meta.width, 640);
});

test("a file that is not an image fails loudly and is not returned as a photo", async () => {
  await assert.rejects(
    () => polishListingPhotoDataUrl("data:image/jpeg;base64,bm90LWFuLWltYWdl"),
    (err) => err instanceof ListingPhotoPolishError && /could not read/i.test(err.message),
  );
});

test("catalogue paths and licence files are not polished or sent to vision", async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    throw new Error("vision should not be called");
  };
  const env = {
    LISTING_PHOTO_VISION_URL: "https://vision.example.test/frame",
    LISTING_PHOTO_VISION_KEY: "test-key",
  };
  const path = await polishListingPhotoDataUrl("/photos/buildings/mb-1052.jpg", { env, fetchImpl });
  assert.equal(path.dataUrl, "/photos/buildings/mb-1052.jpg");
  assert.equal(path.skipped, true);
  const pdf = await polishListingPhotoDataUrl("data:application/pdf;base64,JVBERi0x", { env, fetchImpl });
  assert.equal(pdf.skipped, true);
  assert.equal(called, 0);
});

test("vision is used when configured and a failed call still deskews", async () => {
  const input = await buildingJpeg({ tilt: 8, shiftX: -20 });
  let sawImage = false;
  const used = await polishListingPhotoDataUrl(dataUrl(input), {
    env: {
      LISTING_PHOTO_VISION_URL: "https://vision.example.test/frame",
      LISTING_PHOTO_VISION_KEY: "test-key",
    },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      sawImage = typeof body.imageBase64 === "string" && body.imageBase64.length > 20;
      assert.equal(body.task, "listing-photo-frame");
      return {
        ok: true,
        async json() {
          return { angleDeg: -8, crop: { left: 0.02, top: 0.02, width: 0.7, height: 0.75 } };
        },
      };
    },
  });
  assert.equal(sawImage, true);
  assert.equal(used.vision, "used");
  assert.equal(used.polished, true);

  const failed = await polishListingPhotoDataUrl(dataUrl(input), {
    env: {
      LISTING_PHOTO_VISION_URL: "https://vision.example.test/frame",
      LISTING_PHOTO_VISION_KEY: "test-key",
    },
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(failed.vision, "failed");
  assert.equal(failed.polished, true);
  const after = await subjectStats(Buffer.from(failed.dataUrl.split(",")[1], "base64"));
  assert.ok(Math.abs(after.tilt) < 2.5, `fallback tilt ${after.tilt}`);
});

test("stored lists polish only centre uploads and keep catalogue paths", async () => {
  const input = await buildingJpeg({ tilt: 7, shiftX: 30 });
  const list = await polishStoredPhotoList(
    `/photos/buildings/mb-1.jpg,${dataUrl(input)},/photos/wpg/1-logo.png`,
    { env: {} },
  );
  assert.equal(list.polished, 1);
  assert.equal(list.skipped, 2);
  assert.match(list.photos, /^\/photos\/buildings\/mb-1\.jpg,data:image\/jpeg;base64,/);
  assert.match(list.photos, /\/photos\/wpg\/1-logo\.png$/);
});

test("upload and admin reprocess call the polisher and do not touch Live gates", () => {
  const claims = src("src/lib/server/claims.ts");
  const family = src("src/lib/server/family.ts");
  const reprocess = src("src/lib/server/reprocess-listing-photos.ts");
  const admin = src("src/routes/admin.tsx");
  const card = src("src/components/admin-review-card.tsx");
  const docs = src("docs/listing-photo-polish.md");
  const env = src(".env.example");
  const script = src("scripts/reprocess-listing-photos.mjs");
  assert.match(claims, /prepareListingUploadPhoto\(data\.storefront\)/);
  assert.match(claims, /prepareListingUploadPhoto\(src\)/);
  assert.match(claims, /persistLicenseInput\(data\.licensePhoto/);
  assert.doesNotMatch(claims, /prepareListingUploadPhoto\(data\.licensePhoto\)/);
  assert.match(family, /prepareListingUploadPhoto\(data\.storefront\)/);
  assert.match(reprocess, /polishStoredPhotoList/);
  assert.match(reprocess, /assertGraceReauth/);
  assert.doesNotMatch(reprocess, /assertRecentReauth/);
  assert.doesNotMatch(reprocess, /claim_status/);
  assert.doesNotMatch(reprocess, /runApproval/);
  assert.doesNotMatch(reprocess, /kids-world-daycare-kh2t/);
  assert.match(admin, /reprocessListingPhotos/);
  assert.match(admin, /onStraighten/);
  assert.match(card, /data-ke="admin-straighten-photo"/);
  assert.match(card, /data:image\//);
  assert.match(docs, /original upload is kept/);
  assert.match(docs, /LISTING_PHOTO_VISION_URL/);
  assert.match(env, /# LISTING_PHOTO_VISION_URL=/);
  assert.match(env, /# LISTING_PHOTO_VISION_KEY=/);
  assert.doesNotMatch(env, /LISTING_PHOTO_VISION_KEY=\S/);
  assert.match(script, /--slug kids-world-daycare-kh2t/);
  assert.equal(parseReprocessArgs(["--slug", "another-centre"]).slug, "another-centre");
  assert.equal(parseReprocessArgs(["--id", "d_abc", "--dry-run"]).dryRun, true);
  assert.throws(() => parseReprocessArgs([]), /--slug or --id/);
});
