import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";
import { decodeWindowsBmp } from "../src/lib/bmp-decode.ts";
import { tx } from "../src/lib/copy.ts";
import {
  MAX_LISTING_PHOTOS,
  acceptManagedPhoto,
  applyManagedListingPhotos,
  classifyListingPhotos,
  listingPhotoRoom,
  makeListingCover,
  managedListingPhotos,
  moveListingPhoto,
  removeListingPhoto,
} from "../src/lib/listing-photo.ts";
import {
  LISTING_PHOTO_ACCEPT,
  LISTING_PHOTO_MAX_EDGE,
  LISTING_PHOTO_TARGET_BYTES,
  ListingPhotoPrepareError,
  bytesToDataUrl,
  detectListingImageFormat,
  exifCanvasTransform,
  fittedListingSize,
  listingPhotoByteBudget,
  prepareClientListingPhoto,
  readJpegExifOrientation,
} from "../src/lib/listing-photo-downgrade.ts";
import { polishListingPhotoDataUrl, prepareListingUploadPhoto } from "../src/lib/server/polish-listing-photo.ts";
import { R2_ALLOWED_TYPES, R2_LISTING_STORED_TYPES } from "../src/lib/server/r2.ts";
import { LISTING_PHOTO_MAX_BYTES } from "../src/lib/upload-limits.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function brandBox(brand) {
  const bytes = new Uint8Array(16);
  bytes[3] = 16;
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  bytes.set(Array.from(brand).map((ch) => ch.charCodeAt(0)), 8);
  return bytes;
}

function jpegWithOrientation(orientation, little = false) {
  const tiff = Buffer.alloc(26);
  if (little) {
    tiff.writeUInt16LE(0x4949, 0);
    tiff.writeUInt16LE(0x002a, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10);
    tiff.writeUInt16LE(3, 12);
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt16LE(orientation, 18);
    tiff.writeUInt32LE(0, 22);
  } else {
    tiff.writeUInt16BE(0x4d4d, 0);
    tiff.writeUInt16BE(0x002a, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10);
    tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt16BE(orientation, 18);
    tiff.writeUInt32BE(0, 22);
  }
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff, Buffer.from("GPSLatitude")]);
  const app1 = Buffer.alloc(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])]);
}

function bmp24(width, height) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = row * height;
  const header = 54;
  const buf = Buffer.alloc(header + pixelSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(header, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = header + y * row + x * 3;
      buf[o] = 30;
      buf[o + 1] = 90;
      buf[o + 2] = 180;
    }
  }
  return buf;
}

test("listing photos cap at 10 including the cover, with reorder delete and cover", () => {
  assert.equal(MAX_LISTING_PHOTOS, 10);
  assert.equal(listingPhotoRoom(3), 7);
  assert.equal(listingPhotoRoom(10), 0);
  assert.equal(listingPhotoRoom(0), 10);
  const cover = "/photos/buildings/mb-1.jpg";
  const play = "data:image/webp;base64,cGxheQ==";
  const yard = "data:image/jpeg;base64,eWFyZA==";
  const logo = "/photos/wpg/1-logo.png";
  const current = `${cover},${play},${logo}`;
  assert.deepEqual(managedListingPhotos(current), [cover, play]);
  const reordered = applyManagedListingPhotos(current, [yard, cover]);
  assert.equal(reordered, `${yard},${cover},${logo}`);
  assert.equal(applyManagedListingPhotos(current, []), logo);
  const tooMany = Array.from({ length: 12 }, (_, i) => `data:image/jpeg;base64,e${i}==`);
  const capped = classifyListingPhotos(applyManagedListingPhotos(current, tooMany));
  assert.equal(capped.storefront, tooMany[0]);
  assert.equal(1 + capped.interiors.length, MAX_LISTING_PHOTOS);
  assert.deepEqual(capped.logos, [logo]);
  assert.equal(acceptManagedPhoto(logo), false);
  assert.equal(acceptManagedPhoto("data:image/heic;base64,aaaa"), true);
  const order = ["a", "b", "c"];
  assert.deepEqual(moveListingPhoto(order, 2, -1), ["a", "c", "b"]);
  assert.deepEqual(makeListingCover(order, 2), ["c", "a", "b"]);
  assert.deepEqual(removeListingPhoto(order, 1), ["a", "c"]);
  assert.equal(tx("en", "photoCount").replace("{n}", "3").replace("{max}", "10"), "3 of 10");
  assert.equal(tx("fr", "photoCount").replace("{n}", "3").replace("{max}", "10"), "3 sur 10");
  assert.doesNotMatch(tx("fr", "photoAtCap"), /\bof\b|Remove one/);
  assert.match(tx("fr", "photoAtCap"), /10 photos/);
  assert.match(tx("en", "photoAtCap"), /10 photos/);
});

test("file input accept lists every popular photo type and is not image/* alone", () => {
  for (const token of ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp", "image/tiff", "image/heic", "image/heif", ".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif"]) {
    assert.ok(LISTING_PHOTO_ACCEPT.split(",").includes(token), token);
  }
  assert.equal(LISTING_PHOTO_ACCEPT.includes("image/*"), false);
  const forms = src("src/components/provider-listing-forms.tsx");
  const provider = src("src/routes/provider.tsx");
  const downgrade = src("src/lib/listing-photo-downgrade.ts");
  assert.match(forms, /accept=\{LISTING_PHOTO_ACCEPT\}/);
  assert.match(forms, /Array\.from\(e\.target\.files\)/);
  const photoChange = forms.slice(forms.indexOf('data-ke="listing-photo-input"'));
  assert.ok(photoChange.indexOf("Array.from(e.target.files)") < photoChange.indexOf('e.target.value = ""'));
  assert.match(provider, /accept=\{LISTING_PHOTO_ACCEPT\}/);
  assert.match(forms, /role="progressbar"/);
  assert.match(forms, /photoCount/);
  assert.match(downgrade, /from "heic-decode"|import\("heic-decode"\)/);
  assert.match(downgrade, /ImageData/);
  assert.doesNotMatch(downgrade, /heic2any/);
  assert.doesNotMatch(downgrade, /new Function/);
  assert.doesNotMatch(downgrade, /isListingPhotoTooBig/);
  assert.doesNotMatch(provider, /isListingPhotoTooBig/);
});

test("type detection uses magic bytes, extension, and MIME, including empty HEIC MIME", () => {
  assert.equal(detectListingImageFormat({ mime: "", name: "IMG_1.HEIC", bytes: brandBox("heic") }), "heic");
  assert.equal(detectListingImageFormat({ mime: "", name: "shot.heif", bytes: brandBox("mif1") }), "heif");
  assert.equal(detectListingImageFormat({ mime: "image/jpeg", name: "x.jpg", bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) }), "png");
  assert.equal(detectListingImageFormat({ mime: "", name: "room.tiff", bytes: new Uint8Array(4) }), "tiff");
  assert.equal(detectListingImageFormat({ mime: "image/webp", name: "nope.bin", bytes: new Uint8Array(4) }), "webp");
  assert.equal(detectListingImageFormat({ mime: "application/pdf", name: "scan.pdf", bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]) }), null);
  assert.equal(detectListingImageFormat({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }), "jpeg");
  assert.equal(detectListingImageFormat({ bytes: brandBox("avif") }), "avif");
  assert.equal(detectListingImageFormat({ bytes: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]) }), "gif");
  assert.equal(detectListingImageFormat({ bytes: Uint8Array.from([0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }), "bmp");
  const webp = new Uint8Array(12);
  webp.set(Array.from("RIFF").map((ch) => ch.charCodeAt(0)));
  webp.set(Array.from("WEBP").map((ch) => ch.charCodeAt(0)), 8);
  assert.equal(detectListingImageFormat({ mime: "", bytes: webp }), "webp");
  const tiff = Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectListingImageFormat({ bytes: tiff }), "tiff");
});

test("EXIF orientation is applied, GPS is not copied, and large phone JPEGs are compressed instead of rejected", async () => {
  const oriented = jpegWithOrientation(6, false);
  assert.equal(readJpegExifOrientation(oriented), 6);
  assert.equal(readJpegExifOrientation(jpegWithOrientation(8, true)), 8);
  assert.equal(readJpegExifOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), 1);
  const fitted = fittedListingSize(4000, 3000, 6, LISTING_PHOTO_MAX_EDGE);
  assert.equal(Math.max(fitted.width, fitted.height), 1600);
  assert.equal(fitted.width, 1200);
  assert.equal(fitted.height, 1600);
  const small = fittedListingSize(400, 300, 1);
  assert.deepEqual(small, { width: 400, height: 300 });
  const turn = exifCanvasTransform(6, fitted.width, fitted.height);
  assert.equal(turn.e, fitted.width);
  assert.equal(turn.drawW, fitted.height);
  assert.equal(turn.drawH, fitted.width);

  const phone = new Uint8Array(2_000_000);
  phone.set(oriented.subarray(0, Math.min(oriented.length, phone.length)));
  let first = null;
  const prepared = await prepareClientListingPhoto({
    mime: "",
    name: "IMG_0001.JPG",
    bytes: phone,
    srcWidth: 4000,
    srcHeight: 3000,
    targetBytes: LISTING_PHOTO_TARGET_BYTES,
    preferWebp: true,
    encode: async (req) => {
      first ??= req;
      const n = Math.max(1, Math.round(req.width * req.height * req.quality * 2));
      return new Uint8Array(n);
    },
  });
  assert.equal(first.width, 1200);
  assert.equal(first.height, 1600);
  assert.equal(first.mime, "image/webp");
  assert.ok(prepared.byteLength <= LISTING_PHOTO_TARGET_BYTES);
  assert.ok(prepared.byteLength < LISTING_PHOTO_MAX_BYTES);
  const payload = Buffer.from(prepared.dataUrl.split(",")[1], "base64");
  assert.equal(payload.includes(Buffer.from("GPSLatitude")), false);
  assert.equal(payload.includes(Buffer.from("Exif")), false);

  const tiny = await prepareClientListingPhoto({
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    name: "small.jpg",
    srcWidth: 400,
    srcHeight: 300,
    preferWebp: false,
    encode: async (req) => new Uint8Array(req.width === 400 && req.height === 300 ? 32 : 1),
  });
  assert.equal(tiny.width, 400);
  assert.equal(tiny.height, 300);
  assert.match(tiny.dataUrl, /^data:image\/jpeg;base64,/);

  let encoded = false;
  await assert.rejects(
    () =>
      prepareClientListingPhoto({
        bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]),
        name: "notes.pdf",
        mime: "application/pdf",
        srcWidth: 10,
        srcHeight: 10,
        encode: async () => {
          encoded = true;
          return new Uint8Array([1]);
        },
      }),
    (err) => err instanceof ListingPhotoPrepareError && err.code === "not-image",
  );
  assert.equal(encoded, false);
  assert.equal(listingPhotoByteBudget(1), LISTING_PHOTO_TARGET_BYTES);
  const fullDesk = listingPhotoByteBudget(MAX_LISTING_PHOTOS);
  assert.ok(fullDesk < LISTING_PHOTO_TARGET_BYTES);
  assert.ok((fullDesk * MAX_LISTING_PHOTOS * 4) / 3 < 3_800_000);
});

test("server polish converts every popular photo type to JPEG and strips EXIF", async () => {
  const base = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#c45a2a" },
  })
    .png()
    .toBuffer();
  const wide = await sharp({
    create: { width: 2400, height: 1800, channels: 3, background: "#245" },
  })
    .jpeg()
    .toBuffer();
  const samples = {
    jpeg: await sharp(base).jpeg().toBuffer(),
    png: base,
    webp: await sharp(base).webp().toBuffer(),
    gif: await sharp(base).gif().toBuffer(),
    tiff: await sharp(base).tiff().toBuffer(),
    avif: await sharp(base).avif().toBuffer(),
    bmp: bmp24(32, 24),
    heic: readFileSync(join(root, "scripts/fixtures/listing-photos/sample.heic")),
    heif: readFileSync(join(root, "scripts/fixtures/listing-photos/sample.heif")),
  };
  const mime = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    tiff: "image/tiff",
    avif: "image/avif",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
  };
  for (const [format, buf] of Object.entries(samples)) {
    const decoded = decodeWindowsBmp(buf);
    if (format === "bmp") {
      assert.equal(decoded?.width, 32);
      assert.equal(decoded?.height, 24);
    }
    const result = await prepareListingUploadPhoto(bytesToDataUrl(mime[format], buf));
    assert.match(result, /^data:image\/jpeg;base64,/, format);
    const out = Buffer.from(result.split(",")[1], "base64");
    assert.ok(out.byteLength <= LISTING_PHOTO_MAX_BYTES, format);
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "jpeg", format);
    assert.ok(meta.width <= 1600 && meta.height <= 1600, format);
    assert.equal(meta.exif, undefined, format);
    assert.ok(R2_LISTING_STORED_TYPES.includes("image/jpeg"));
  }
  const big = await polishListingPhotoDataUrl(bytesToDataUrl("image/jpeg", wide), { env: {} });
  const bigMeta = await sharp(Buffer.from(big.dataUrl.split(",")[1], "base64")).metadata();
  assert.ok(Math.max(bigMeta.width, bigMeta.height) <= 1600);

  const withExif = await sharp(samples.jpeg).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rotated = await polishListingPhotoDataUrl(bytesToDataUrl("image/jpeg", withExif), { env: {} });
  const rotatedMeta = await sharp(Buffer.from(rotated.dataUrl.split(",")[1], "base64")).metadata();
  assert.equal(rotatedMeta.exif, undefined);
  assert.ok(!rotatedMeta.orientation || rotatedMeta.orientation === 1);
  for (const type of R2_LISTING_STORED_TYPES) {
    assert.ok(R2_ALLOWED_TYPES.includes(type), type);
  }
  assert.equal(R2_ALLOWED_TYPES.includes("image/heic"), false);
  assert.equal(R2_ALLOWED_TYPES.includes("image/heif"), false);
  assert.match(src("src/lib/server/claims.ts"), /applyManagedListingPhotos/);
  assert.match(src("src/lib/server/claims.ts"), /prepareListingUploadPhoto\(data\.storefront\)/);
  assert.match(src("src/lib/server/claims.ts"), /applyInteriorPhotos\(photos, interiors\)/);
});
