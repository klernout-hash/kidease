/**
 * Client-side listing photo downgrade.
 *
 * Phone photos are converted before upload: type is detected from magic bytes,
 * the file extension, and MIME (HEIC often arrives with an empty MIME). EXIF
 * orientation is applied, GPS metadata is dropped by re-encoding, and the
 * result is WebP (JPEG when that browser cannot encode WebP). The long edge
 * stays at or under 1600px and the bytes stay under the upload budget so a
 * normal camera-roll photo is never rejected for size.
 */
import { MAX_LISTING_PHOTOS } from "./listing-photo.ts";

export const LISTING_PHOTO_TARGET_BYTES = 1_000_000;
export const LISTING_PHOTO_MAX_EDGE = 1600;
/**
 * Binary budget for every photo in one updateListing body.
 * Base64 expands by 4/3, and Vercel rejects request bodies near 4.5 MB.
 */
export const LISTING_PHOTO_BODY_BUDGET_BYTES = 2_600_000;

export const LISTING_PHOTO_ACCEPT = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
].join(",");

export type ListingImageFormat = "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "avif" | "heic" | "heif";

export type ListingPhotoPrepareCode = "not-image" | "unreadable";

export class ListingPhotoPrepareError extends Error {
  readonly code: ListingPhotoPrepareCode;
  constructor(code: ListingPhotoPrepareCode) {
    super(code === "not-image" ? "not-image" : "unreadable");
    this.name = "ListingPhotoPrepareError";
    this.code = code;
  }
}

const MIME_FORMAT: Record<string, ListingImageFormat> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/tiff": "tiff",
  "image/tif": "tiff",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/heic-sequence": "heic",
  "image/heif-sequence": "heif",
};

const EXT_FORMAT: Record<string, ListingImageFormat> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
  bmp: "bmp",
  tif: "tiff",
  tiff: "tiff",
  avif: "avif",
  heic: "heic",
  heif: "heif",
};

const FORMAT_MIME: Record<ListingImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

export function listingPhotoByteBudget(photoSlots = 1): number {
  const slots = Math.min(MAX_LISTING_PHOTOS, Math.max(1, Math.floor(photoSlots) || 1));
  return Math.min(LISTING_PHOTO_TARGET_BYTES, Math.max(80_000, Math.floor(LISTING_PHOTO_BODY_BUDGET_BYTES / slots)));
}

export function clampPhotoProgress(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[start + i] ?? 0);
  return out;
}

function ftypBrand(bytes: Uint8Array): string {
  if (bytes.byteLength < 12) return "";
  if (ascii(bytes, 4, 4) !== "ftyp") return "";
  return ascii(bytes, 8, 4).toLowerCase();
}

function magicFormat(bytes: Uint8Array | undefined): ListingImageFormat | null {
  if (!bytes || bytes.byteLength < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "png";
  if (ascii(bytes, 0, 4) === "GIF8") return "gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)) {
    return "tiff";
  }
  const brand = ftypBrand(bytes);
  if (brand === "avif" || brand === "avis") return "avif";
  if (brand === "heic" || brand === "heix" || brand === "hevc" || brand === "hevx" || brand === "heim" || brand === "heis") return "heic";
  if (brand === "heif" || brand === "mif1" || brand === "msf1") return "heif";
  return null;
}

function extensionFormat(name: string | undefined): ListingImageFormat | null {
  const ext = String(name ?? "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
  if (!ext) return null;
  return EXT_FORMAT[ext] ?? null;
}

function mimeFormat(mime: string | undefined): ListingImageFormat | null {
  const key = String(mime ?? "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    ?.trim();
  if (!key) return null;
  return MIME_FORMAT[key] ?? null;
}

/** Magic bytes win, then the filename, then MIME. Empty MIME is normal for HEIC. */
export function detectListingImageFormat(input: {
  mime?: string;
  name?: string;
  bytes?: Uint8Array;
}): ListingImageFormat | null {
  return magicFormat(input.bytes) ?? extensionFormat(input.name) ?? mimeFormat(input.mime);
}

function readU16(bytes: Uint8Array, offset: number, little: boolean): number {
  if (offset + 1 >= bytes.byteLength) return 0;
  return little ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) : ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number {
  if (offset + 3 >= bytes.byteLength) return 0;
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  return little ? (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0 : ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

/** JPEG orientation 1–8. Missing or non-JPEG input stays upright (1). */
export function readJpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) return 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const size = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (size < 2 || offset + 2 + size > bytes.byteLength) return 1;
    if (marker === 0xe1) {
      const found = orientationFromExif(bytes.subarray(offset + 4, offset + 2 + size));
      if (found) return found;
    }
    offset += 2 + size;
  }
  return 1;
}

function orientationFromExif(segment: Uint8Array): number | null {
  if (segment.byteLength < 16) return null;
  if (ascii(segment, 0, 4) !== "Exif" || segment[4] !== 0 || segment[5] !== 0) return null;
  const tiff = 6;
  const little = segment[tiff] === 0x49 && segment[tiff + 1] === 0x49;
  const big = segment[tiff] === 0x4d && segment[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  if (readU16(segment, tiff + 2, little) !== 0x002a) return null;
  let ifd = tiff + readU32(segment, tiff + 4, little);
  for (let hop = 0; hop < 4; hop++) {
    if (ifd + 2 > segment.byteLength) return null;
    const count = readU16(segment, ifd, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > segment.byteLength) return null;
      if (readU16(segment, entry, little) === 0x0112) {
        const value = readU16(segment, entry + 8, little);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
    const nextPtr = ifd + 2 + count * 12;
    if (nextPtr + 4 > segment.byteLength) return null;
    const next = readU32(segment, nextPtr, little);
    if (!next) return null;
    ifd = tiff + next;
  }
  return null;
}

export function fittedListingSize(srcW: number, srcH: number, orientation = 1, maxEdge = LISTING_PHOTO_MAX_EDGE) {
  const swap = orientation >= 5 && orientation <= 8;
  const orientedW = Math.max(1, swap ? srcH : srcW);
  const orientedH = Math.max(1, swap ? srcW : srcH);
  const long = Math.max(orientedW, orientedH);
  const scale = long > maxEdge ? maxEdge / long : 1;
  return {
    width: Math.max(1, Math.round(orientedW * scale)),
    height: Math.max(1, Math.round(orientedH * scale)),
  };
}

/** Canvas setTransform for EXIF orientation. drawW/drawH are the source draw size. */
export function exifCanvasTransform(orientation: number, canvasW: number, canvasH: number) {
  const w = canvasW;
  const h = canvasH;
  switch (orientation) {
    case 2:
      return { a: -1, b: 0, c: 0, d: 1, e: w, f: 0, drawW: w, drawH: h };
    case 3:
      return { a: -1, b: 0, c: 0, d: -1, e: w, f: h, drawW: w, drawH: h };
    case 4:
      return { a: 1, b: 0, c: 0, d: -1, e: 0, f: h, drawW: w, drawH: h };
    case 5:
      return { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0, drawW: h, drawH: w };
    case 6:
      return { a: 0, b: 1, c: -1, d: 0, e: w, f: 0, drawW: h, drawH: w };
    case 7:
      return { a: 0, b: -1, c: -1, d: 0, e: w, f: h, drawW: h, drawH: w };
    case 8:
      return { a: 0, b: -1, c: 1, d: 0, e: 0, f: h, drawW: h, drawH: w };
    default:
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, drawW: w, drawH: h };
  }
}

export type ListingEncodeRequest = {
  width: number;
  height: number;
  mime: "image/webp" | "image/jpeg";
  quality: number;
};

export async function shrinkListingRaster(opts: {
  srcWidth: number;
  srcHeight: number;
  orientation?: number;
  targetBytes: number;
  maxEdge?: number;
  preferWebp?: boolean;
  encode: (req: ListingEncodeRequest) => Promise<Uint8Array>;
}): Promise<{ bytes: Uint8Array; mime: "image/webp" | "image/jpeg"; width: number; height: number; quality: number }> {
  if (opts.srcWidth < 1 || opts.srcHeight < 1) throw new ListingPhotoPrepareError("unreadable");
  const base = fittedListingSize(opts.srcWidth, opts.srcHeight, opts.orientation ?? 1, opts.maxEdge ?? LISTING_PHOTO_MAX_EDGE);
  const mime: "image/webp" | "image/jpeg" = opts.preferWebp === false ? "image/jpeg" : "image/webp";
  let quality = 0.82;
  let scale = 1;
  let last: { bytes: Uint8Array; mime: "image/webp" | "image/jpeg"; width: number; height: number; quality: number } | null = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const width = Math.max(1, Math.round(base.width * scale));
    const height = Math.max(1, Math.round(base.height * scale));
    const bytes = await opts.encode({ width, height, mime, quality });
    if (!bytes.byteLength) throw new ListingPhotoPrepareError("unreadable");
    last = { bytes, mime, width, height, quality };
    if (bytes.byteLength <= opts.targetBytes) return last;
    if (quality > 0.5) quality = Math.round((quality - 0.08) * 100) / 100;
    else scale *= 0.75;
    if (Math.max(width, height) <= 240 && quality <= 0.5) break;
  }
  if (!last || last.bytes.byteLength > opts.targetBytes) throw new ListingPhotoPrepareError("unreadable");
  return last;
}

export function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Detect, orient, resize, and compress. `encode` is the browser canvas (or a test double).
 * File size is not a reason to reject — only a missing image type or a failed decode.
 */
export async function prepareClientListingPhoto(input: {
  mime?: string;
  name?: string;
  bytes: Uint8Array;
  srcWidth: number;
  srcHeight: number;
  targetBytes?: number;
  preferWebp?: boolean;
  encode: (req: ListingEncodeRequest) => Promise<Uint8Array>;
}): Promise<{ dataUrl: string; mime: "image/webp" | "image/jpeg"; byteLength: number; width: number; height: number }> {
  const format = detectListingImageFormat({ mime: input.mime, name: input.name, bytes: input.bytes });
  if (!format) throw new ListingPhotoPrepareError("not-image");
  const orientation = format === "jpeg" ? readJpegExifOrientation(input.bytes) : 1;
  const shrunk = await shrinkListingRaster({
    srcWidth: input.srcWidth,
    srcHeight: input.srcHeight,
    orientation,
    targetBytes: input.targetBytes ?? LISTING_PHOTO_TARGET_BYTES,
    preferWebp: input.preferWebp !== false,
    encode: input.encode,
  });
  return {
    dataUrl: bytesToDataUrl(shrunk.mime, shrunk.bytes),
    mime: shrunk.mime,
    byteLength: shrunk.bytes.byteLength,
    width: shrunk.width,
    height: shrunk.height,
  };
}

function canvasSupportsWebp(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

async function decodeHeicBlob(file: Blob): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob) throw new ListingPhotoPrepareError("unreadable");
  return blob;
}

async function bitmapFromBlob(blob: Blob): Promise<{ bitmap: ImageBitmap; browserOriented: boolean }> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
    return { bitmap, browserOriented: false };
  } catch {
    const bitmap = await createImageBitmap(blob);
    return { bitmap, browserOriented: true };
  }
}

function renderBitmap(bitmap: ImageBitmap, width: number, height: number, orientation: number, mime: "image/webp" | "image/jpeg", quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new ListingPhotoPrepareError("unreadable"));
  const transform = exifCanvasTransform(orientation, width, height);
  ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
  ctx.drawImage(bitmap, 0, 0, transform.drawW, transform.drawH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new ListingPhotoPrepareError("unreadable"));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}

/** Convert one selected file to a small WebP or JPEG data URL. */
export async function downgradeListingPhotoFile(
  file: File,
  opts?: { onProgress?: (pct: number) => void; targetBytes?: number },
): Promise<string> {
  const progress = (n: number) => opts?.onProgress?.(clampPhotoProgress(n));
  progress(8);
  const bytes = new Uint8Array(await file.arrayBuffer());
  progress(22);
  const format = detectListingImageFormat({ mime: file.type, name: file.name, bytes });
  if (!format) throw new ListingPhotoPrepareError("not-image");
  progress(36);
  let bitmap: ImageBitmap;
  let orientation = format === "jpeg" ? readJpegExifOrientation(bytes) : 1;
  try {
    if (format === "heic" || format === "heif") {
      const jpegBlob = await decodeHeicBlob(file);
      const decoded = await bitmapFromBlob(jpegBlob);
      bitmap = decoded.bitmap;
      orientation = 1;
    } else {
      const decoded = await bitmapFromBlob(file);
      bitmap = decoded.bitmap;
      if (decoded.browserOriented) orientation = 1;
    }
  } catch (err) {
    if (err instanceof ListingPhotoPrepareError && err.code === "not-image") throw err;
    if (file.size > 0 && file.size <= 2_400_000) {
      progress(100);
      return bytesToDataUrl(FORMAT_MIME[format], bytes);
    }
    throw new ListingPhotoPrepareError("unreadable");
  }
  progress(58);
  const targetBytes = opts?.targetBytes ?? listingPhotoByteBudget(MAX_LISTING_PHOTOS);
  const run = async (preferWebp: boolean) => {
    const shrunk = await shrinkListingRaster({
      srcWidth: bitmap.width,
      srcHeight: bitmap.height,
      orientation,
      targetBytes,
      preferWebp,
      encode: async (req) => {
        const blob = await renderBitmap(bitmap, req.width, req.height, orientation, req.mime, req.quality);
        return new Uint8Array(await blob.arrayBuffer());
      },
    });
    return bytesToDataUrl(shrunk.mime, shrunk.bytes);
  };
  try {
    const preferWebp = canvasSupportsWebp();
    try {
      const url = await run(preferWebp);
      progress(100);
      return url;
    } catch (err) {
      if (!preferWebp) throw err;
      const url = await run(false);
      progress(100);
      return url;
    }
  } finally {
    bitmap.close?.();
  }
}
