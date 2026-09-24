/**
 * Straighten, sharpen, and frame a listing photo the centre uploaded.
 *
 * Runs on daycare storefront / interior data URLs and on Admin reprocess of
 * those same uploads. Catalogue `/photos/…` files, licence scans, and
 * screening docs are not inputs — callers must not pass them.
 *
 * Order:
 * 1. Decode. A buffer sharp cannot read throws `ListingPhotoPolishError`
 *    so the save fails instead of storing a broken image.
 * 2. Optional vision hook (`LISTING_PHOTO_VISION_URL` + `LISTING_PHOTO_VISION_KEY`).
 *    Missing keys, or a failed call, fall through to the deterministic pass.
 * 3. Deterministic deskew (dominant edges), content crop around the subject,
 *    then a mild unsharp mask. Output is JPEG, max edge 1600, under the
 *    listing upload cap.
 * 4. If that enhance step throws after a successful decode of JPEG, PNG, or
 *    WebP, the original data URL is kept. HEIC, HEIF, BMP, TIFF, GIF, and
 *    AVIF are still re-encoded to JPEG so a container the browser could not
 *    shrink is never stored as-is.
 */
import sharp, { type Sharp } from "sharp";
import { decodeWindowsBmp } from "../bmp-decode.ts";
import { splitPhotoList } from "../listing-photo.ts";
import { LISTING_PHOTO_MAX_BYTES } from "../upload-limits.ts";

export const LISTING_PHOTO_VISION_URL_ENV = "LISTING_PHOTO_VISION_URL";
export const LISTING_PHOTO_VISION_KEY_ENV = "LISTING_PHOTO_VISION_KEY";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 1600;
const SEARCH_LIMIT_DEG = 12;
const SEARCH_STEP_DEG = 0.5;
const MIN_USEFUL_ANGLE = 0.35;

const DATA_IMAGE =
  /^data:(image\/(?:jpeg|jpg|png|webp|avif|gif|bmp|x-ms-bmp|tiff|tif|heic|heif|heic-sequence|heif-sequence));base64,([a-z0-9+/=\s]+)$/i;

const STORED_LISTING_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export class ListingPhotoPolishError extends Error {
  readonly status = 400;
  constructor(message = "Could not read that photo. Use a JPG, PNG, HEIC, WebP, AVIF, GIF, BMP, or TIFF.") {
    super(message);
    this.name = "ListingPhotoPolishError";
  }
}

export type PolishVision = "off" | "used" | "failed";

export type PolishOutcome = {
  dataUrl: string;
  polished: boolean;
  keptOriginal: boolean;
  skipped: boolean;
  reason: string;
  angleDeg: number;
  cropped: boolean;
  sharpened: boolean;
  vision: PolishVision;
};

type EnvMap = Record<string, string | undefined>;

export type PolishOptions = {
  env?: EnvMap;
  fetchImpl?: typeof fetch;
  /** Test hook. After a successful decode, skip enhance and keep the original. */
  forceEnhanceError?: boolean;
};

type Rgb = { r: number; g: number; b: number };

type Raster = {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
};

type Box = { left: number; top: number; width: number; height: number };

type VisionFrame = {
  angleDeg: number | null;
  crop: { left: number; top: number; width: number; height: number } | null;
};

export function isCentreUploadedImageDataUrl(src: string | undefined | null): boolean {
  return DATA_IMAGE.test(String(src ?? "").trim());
}

export function listingPhotoVisionConfigured(env: EnvMap = process.env): boolean {
  return Boolean(env[LISTING_PHOTO_VISION_URL_ENV]?.trim() && env[LISTING_PHOTO_VISION_KEY_ENV]?.trim());
}

export async function prepareListingUploadPhoto(
  src: string | undefined,
  opts?: PolishOptions,
): Promise<string | undefined> {
  const raw = (src ?? "").trim();
  if (!raw) return src;
  if (!isCentreUploadedImageDataUrl(raw)) return raw;
  const result = await polishListingPhotoDataUrl(raw, opts);
  return result.dataUrl;
}

export async function polishListingPhotoDataUrl(src: string, opts?: PolishOptions): Promise<PolishOutcome> {
  const raw = src.trim();
  if (!isCentreUploadedImageDataUrl(raw)) {
    return {
      dataUrl: raw,
      polished: false,
      keptOriginal: true,
      skipped: true,
      reason: "not-a-centre-upload",
      angleDeg: 0,
      cropped: false,
      sharpened: false,
      vision: "off",
    };
  }
  const parsed = parseDataUrl(raw);
  const polished = await polishListingPhotoBuffer(parsed.buffer, parsed.mime, opts);
  return {
    dataUrl: polished.dataUrl,
    polished: polished.polished,
    keptOriginal: polished.keptOriginal,
    skipped: false,
    reason: polished.reason,
    angleDeg: polished.angleDeg,
    cropped: polished.cropped,
    sharpened: polished.sharpened,
    vision: polished.vision,
  };
}

export async function polishStoredPhotoList(raw: string, opts?: PolishOptions) {
  const parts = splitPhotoList(raw);
  let polished = 0;
  let keptOriginal = 0;
  let skipped = 0;
  const next: string[] = [];
  for (const part of parts) {
    if (!isCentreUploadedImageDataUrl(part)) {
      skipped += 1;
      next.push(part);
      continue;
    }
    const result = await polishListingPhotoDataUrl(part, opts);
    next.push(result.dataUrl);
    if (result.polished) polished += 1;
    else keptOriginal += 1;
  }
  return { photos: next.join(","), polished, keptOriginal, skipped };
}

type BufferOutcome = {
  dataUrl: string;
  polished: boolean;
  keptOriginal: boolean;
  reason: string;
  angleDeg: number;
  cropped: boolean;
  sharpened: boolean;
  vision: PolishVision;
};

function isDirectlyStoredListingMime(mime: string): boolean {
  return STORED_LISTING_MIME.has(mime.toLowerCase());
}

function ftypBrand(input: Buffer): string {
  if (input.byteLength < 12) return "";
  if (input.toString("ascii", 4, 8) !== "ftyp") return "";
  return input.toString("ascii", 8, 12).toLowerCase();
}

function isHeicFamily(mime: string, input: Buffer): boolean {
  const normalized = mime.toLowerCase();
  if (
    normalized === "image/heic" ||
    normalized === "image/heif" ||
    normalized === "image/heic-sequence" ||
    normalized === "image/heif-sequence"
  ) {
    return true;
  }
  const brand = ftypBrand(input);
  return (
    brand === "heic" ||
    brand === "heix" ||
    brand === "hevc" ||
    brand === "hevx" ||
    brand === "heim" ||
    brand === "heis" ||
    brand === "heif" ||
    brand === "mif1" ||
    brand === "msf1"
  );
}

function isBmpUpload(mime: string, input: Buffer): boolean {
  const normalized = mime.toLowerCase();
  if (normalized === "image/bmp" || normalized === "image/x-ms-bmp") return true;
  return input.byteLength > 2 && input[0] === 0x42 && input[1] === 0x4d;
}

/** BMP and HEVC HEIC/HEIF become PNG so the deskew pass can use sharp. */
async function normalizeSpecialContainers(input: Buffer, mime: string): Promise<{ buffer: Buffer; mime: string; transcoded: boolean }> {
  if (isBmpUpload(mime, input)) {
    const decoded = decodeWindowsBmp(input);
    if (!decoded) throw new ListingPhotoPolishError();
    const png = await sharp(Buffer.from(decoded.rgb), {
      raw: { width: decoded.width, height: decoded.height, channels: 3 },
    })
      .png()
      .toBuffer();
    return { buffer: png, mime: "image/png", transcoded: true };
  }
  if (isHeicFamily(mime, input)) {
    try {
      const decodeHeic = (await import("heic-decode")).default;
      const decoded = await decodeHeic({ buffer: input });
      if (!decoded.width || !decoded.height || decoded.width < 8 || decoded.height < 8) {
        throw new ListingPhotoPolishError();
      }
      const png = await sharp(Buffer.from(decoded.data), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
      })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      return { buffer: png, mime: "image/png", transcoded: true };
    } catch (err) {
      if (err instanceof ListingPhotoPolishError) throw err;
      throw new ListingPhotoPolishError();
    }
  }
  return { buffer: input, mime, transcoded: false };
}

async function polishListingPhotoBuffer(input: Buffer, mime: string, opts?: PolishOptions): Promise<BufferOutcome> {
  if (!input.byteLength) throw new ListingPhotoPolishError("That photo was empty.");
  if (input.byteLength > MAX_INPUT_BYTES) {
    throw new ListingPhotoPolishError("That photo is too large to process.");
  }
  const normalized = await normalizeSpecialContainers(input, mime);
  const source = normalized.buffer;
  const sourceMime = normalized.mime;
  let oriented: Buffer;
  let width = 0;
  let height = 0;
  try {
    const decoded = sharp(source, { failOn: "none", pages: 1, animated: false }).rotate();
    const meta = await decoded.metadata();
    if (!meta.width || !meta.height || meta.width < 8 || meta.height < 8) {
      throw new ListingPhotoPolishError();
    }
    oriented = await sharp(source, { failOn: "none", pages: 1, animated: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .toBuffer();
    const sized = await sharp(oriented).metadata();
    width = sized.width ?? 0;
    height = sized.height ?? 0;
    if (width < 8 || height < 8) throw new ListingPhotoPolishError();
  } catch (err) {
    if (err instanceof ListingPhotoPolishError) throw err;
    throw new ListingPhotoPolishError();
  }

  try {
    if (opts?.forceEnhanceError) throw new Error("enhance failed");
    const enhanced = await enhanceOriented(oriented, width, height, sourceMime, opts);
    const check = await sharp(enhanced.buffer).metadata();
    if (!check.width || !check.height || !enhanced.buffer.byteLength) {
      throw new ListingPhotoPolishError("The straightened photo could not be read.");
    }
    if (enhanced.buffer.byteLength > LISTING_PHOTO_MAX_BYTES) {
      if (normalized.transcoded || !isDirectlyStoredListingMime(mime)) {
        return {
          dataUrl: toDataUrl("image/jpeg", enhanced.buffer),
          polished: true,
          keptOriginal: false,
          reason: "output-over-cap",
          angleDeg: enhanced.angleDeg,
          cropped: enhanced.cropped,
          sharpened: true,
          vision: enhanced.vision,
        };
      }
      return kept(input, mime, "output-over-cap");
    }
    return {
      dataUrl: toDataUrl("image/jpeg", enhanced.buffer),
      polished: true,
      keptOriginal: false,
      reason: "enhanced",
      angleDeg: enhanced.angleDeg,
      cropped: enhanced.cropped,
      sharpened: true,
      vision: enhanced.vision,
    };
  } catch (err) {
    if (err instanceof ListingPhotoPolishError && /could not be read/i.test(err.message)) throw err;
    if (!normalized.transcoded && isDirectlyStoredListingMime(mime)) {
      return kept(input, mime, "enhance-failed");
    }
    try {
      const buffer = await encodeJpeg(sharp(oriented));
      return {
        dataUrl: toDataUrl("image/jpeg", buffer),
        polished: true,
        keptOriginal: false,
        reason: "transcoded",
        angleDeg: 0,
        cropped: false,
        sharpened: false,
        vision: "off",
      };
    } catch {
      throw new ListingPhotoPolishError();
    }
  }
}

function kept(input: Buffer, mime: string, reason: string): BufferOutcome {
  return {
    dataUrl: toDataUrl(mime, input),
    polished: false,
    keptOriginal: true,
    reason,
    angleDeg: 0,
    cropped: false,
    sharpened: false,
    vision: "off",
  };
}

async function enhanceOriented(
  oriented: Buffer,
  width: number,
  height: number,
  mime: string,
  opts?: PolishOptions,
) {
  const analysis = await rasterize(oriented, 180);
  const background = borderColor(analysis);
  const vision = await readVisionFrame(oriented, mime, opts);
  const searched = bestStraightenAngle(analysis);
  const angleDeg = vision.frame?.angleDeg ?? searched;
  let working = oriented;
  let workW = width;
  let workH = height;
  if (Math.abs(angleDeg) >= MIN_USEFUL_ANGLE) {
    working = await sharp(oriented)
      .rotate(angleDeg, { background: background })
      .toBuffer();
    const meta = await sharp(working).metadata();
    workW = meta.width ?? width;
    workH = meta.height ?? height;
  }
  const frame = await rasterize(working, 180);
  const crop = vision.frame?.crop
    ? cropFromFractions(workW, workH, vision.frame.crop)
    : contentCrop(frame, workW, workH);
  let pipeline = sharp(working);
  if (crop) pipeline = pipeline.extract(crop);
  pipeline = pipeline.resize({
    width: MAX_OUTPUT_EDGE,
    height: MAX_OUTPUT_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });
  const buffer = await encodeJpeg(pipeline);
  return {
    buffer,
    angleDeg: Math.abs(angleDeg) >= MIN_USEFUL_ANGLE ? round1(angleDeg) : 0,
    cropped: Boolean(crop),
    vision: vision.status,
  };
}

async function encodeJpeg(pipeline: Sharp): Promise<Buffer> {
  let quality = 82;
  let out = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (out.byteLength > LISTING_PHOTO_MAX_BYTES && quality > 58) {
    quality -= 8;
    out = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return out;
}

function parseDataUrl(src: string): { mime: string; buffer: Buffer } {
  const match = src.trim().match(DATA_IMAGE);
  if (!match) throw new ListingPhotoPolishError();
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.byteLength) throw new ListingPhotoPolishError("That photo was empty.");
  return { mime, buffer };
}

function toDataUrl(mime: string, buffer: Buffer) {
  const type = mime === "image/jpg" ? "image/jpeg" : mime;
  return `data:${type};base64,${buffer.toString("base64")}`;
}

async function rasterize(buf: Buffer, maxEdge: number): Promise<Raster> {
  const { data, info } = await sharp(buf, { failOn: "none" })
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function borderColor(raster: Raster): Rgb {
  const { data, width, height, channels } = raster;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const o = (y * width + x) * channels;
    rs.push(data[o] ?? 0);
    gs.push(data[o + 1] ?? data[o] ?? 0);
    bs.push(data[o + 2] ?? data[o] ?? 0);
  };
  const step = Math.max(1, Math.floor(Math.min(width, height) / 24));
  for (let x = 0; x < width; x += step) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    push(0, y);
    push(width - 1, y);
  }
  return { r: median(rs), g: median(gs), b: median(bs) };
}

function median(values: number[]) {
  if (!values.length) return 255;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

function luminance(raster: Raster, x: number, y: number) {
  const o = (y * raster.width + x) * raster.channels;
  const r = raster.data[o] ?? 0;
  const g = raster.data[o + 1] ?? r;
  const b = raster.data[o + 2] ?? r;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function colorDistance(raster: Raster, x: number, y: number, bg: Rgb) {
  const o = (y * raster.width + x) * raster.channels;
  const r = raster.data[o] ?? 0;
  const g = raster.data[o + 1] ?? r;
  const b = raster.data[o + 2] ?? r;
  const dr = r - bg.r;
  const dg = g - bg.g;
  const db = b - bg.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Degrees to pass to sharp.rotate (positive is clockwise) so strong edges
 * land on the axes. The projection search peaks in the opposite direction
 * from sharp, so the winning angle is negated. A score that is not clearly
 * better than zero keeps the photo unrotated.
 */
export function bestStraightenAngle(raster: Raster): number {
  const gray = new Float32Array(raster.width * raster.height);
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) gray[y * raster.width + x] = luminance(raster, x, y);
  }
  let best = 0;
  let bestScore = uprightScore(gray, raster.width, raster.height, 0);
  const zero = bestScore;
  for (let deg = -SEARCH_LIMIT_DEG; deg <= SEARCH_LIMIT_DEG + 1e-6; deg += SEARCH_STEP_DEG) {
    const score = uprightScore(gray, raster.width, raster.height, deg);
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  if (Math.abs(best) < MIN_USEFUL_ANGLE) return 0;
  if (zero > 0 && bestScore < zero * 1.04) return 0;
  return round1(-best);
}

function uprightScore(gray: Float32Array, w: number, h: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const i = y * w + x;
      const vertical = Math.abs((gray[i + 1] ?? 0) - (gray[i - 1] ?? 0));
      const horizontal = Math.abs((gray[i + w] ?? 0) - (gray[i - w] ?? 0));
      if (vertical < 22 && horizontal < 22) continue;
      const dx = x - cx;
      const dy = y - cy;
      // Clockwise in y-down coordinates, matching sharp's positive rotate.
      const nx = Math.round(cx + dx * cos + dy * sin);
      const ny = Math.round(cy - dx * sin + dy * cos);
      if (vertical >= 22 && nx >= 0 && nx < w) cols[nx] += vertical;
      if (horizontal >= 22 && ny >= 0 && ny < h) rows[ny] += horizontal;
    }
  }
  return variance(cols) + variance(rows);
}

function variance(values: Float64Array) {
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    sum += v;
    sum2 += v * v;
  }
  const n = values.length || 1;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

function contentCrop(raster: Raster, fullW: number, fullH: number): Box | null {
  const bg = borderColor(raster);
  const { width, height } = raster;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (colorDistance(raster, x, y, bg) < 36) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < width * height * 0.02 || maxX < minX || maxY < minY) return null;
  const scaleX = fullW / width;
  const scaleY = fullH / height;
  const box = {
    left: minX * scaleX,
    top: minY * scaleY,
    width: (maxX - minX + 1) * scaleX,
    height: (maxY - minY + 1) * scaleY,
  };
  const coverage = (box.width * box.height) / (fullW * fullH);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const offset = Math.hypot(cx - fullW / 2, cy - fullH / 2) / Math.min(fullW, fullH);
  if (coverage > 0.78 && offset < 0.06) return null;
  return frameAround(fullW, fullH, box);
}

function frameAround(imgW: number, imgH: number, box: Box): Box | null {
  const pad = 0.1;
  const bw = box.width * (1 + pad * 2);
  const bh = box.height * (1 + pad * 2);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const aspect = 4 / 3;
  let cropW = Math.max(bw, bh * aspect);
  let cropH = cropW / aspect;
  if (cropW > imgW) {
    cropW = imgW;
    cropH = cropW / aspect;
  }
  if (cropH > imgH) {
    cropH = imgH;
    cropW = Math.min(imgW, cropH * aspect);
    cropH = cropW / aspect;
  }
  if (cropW < 8 || cropH < 8) return null;
  let left = cx - cropW / 2;
  let top = cy - cropH / 2;
  left = clamp(left, 0, imgW - cropW);
  top = clamp(top, 0, imgH - cropH);
  const framed = {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(cropW),
    height: Math.round(cropH),
  };
  if (framed.left + framed.width > imgW) framed.width = imgW - framed.left;
  if (framed.top + framed.height > imgH) framed.height = imgH - framed.top;
  const almostFull =
    framed.width > imgW * 0.96 && framed.height > imgH * 0.96 && framed.left < imgW * 0.02 && framed.top < imgH * 0.02;
  if (almostFull || framed.width < 8 || framed.height < 8) return null;
  return framed;
}

function cropFromFractions(imgW: number, imgH: number, crop: { left: number; top: number; width: number; height: number }): Box | null {
  const left = clamp(crop.left, 0, 0.95) * imgW;
  const top = clamp(crop.top, 0, 0.95) * imgH;
  const width = clamp(crop.width, 0.05, 1) * imgW;
  const height = clamp(crop.height, 0.05, 1) * imgH;
  return frameAround(imgW, imgH, { left, top, width: Math.min(width, imgW - left), height: Math.min(height, imgH - top) });
}

async function readVisionFrame(
  image: Buffer,
  mime: string,
  opts?: PolishOptions,
): Promise<{ status: PolishVision; frame: VisionFrame | null }> {
  const env = opts?.env ?? process.env;
  const url = env[LISTING_PHOTO_VISION_URL_ENV]?.trim() || "";
  const key = env[LISTING_PHOTO_VISION_KEY_ENV]?.trim() || "";
  if (!url || !key) return { status: "off", frame: null };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "failed", frame: null };
  }
  if (parsed.protocol !== "https:") return { status: "failed", frame: null };
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        task: "listing-photo-frame",
        mime,
        imageBase64: image.toString("base64"),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[listing-photo] vision framing HTTP ${res.status}; using deterministic deskew`);
      return { status: "failed", frame: null };
    }
    const body = (await res.json()) as { angleDeg?: unknown; crop?: unknown };
    return { status: "used", frame: sanitizeVision(body) };
  } catch (err) {
    console.error(
      "[listing-photo] vision framing failed; using deterministic deskew",
      err instanceof Error ? err.message : "",
    );
    return { status: "failed", frame: null };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeVision(body: { angleDeg?: unknown; crop?: unknown }): VisionFrame {
  const angle = typeof body.angleDeg === "number" && Number.isFinite(body.angleDeg) ? clamp(body.angleDeg, -15, 15) : null;
  const cropRaw = body.crop;
  if (!cropRaw || typeof cropRaw !== "object") return { angleDeg: angle, crop: null };
  const box = cropRaw as { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
  const left = num(box.left);
  const top = num(box.top);
  const width = num(box.width);
  const height = num(box.height);
  if (left === null || top === null || width === null || height === null) return { angleDeg: angle, crop: null };
  if (width <= 0 || height <= 0) return { angleDeg: angle, crop: null };
  if (left >= 0 && top >= 0 && width <= 1 && height <= 1 && left + width <= 1.01 && top + height <= 1.01) {
    return { angleDeg: angle, crop: { left, top, width, height } };
  }
  return { angleDeg: angle, crop: null };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
