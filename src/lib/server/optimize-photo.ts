import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { PHOTO_WIDTHS } from "../photo";
import { listingSrcToR2Key, r2ReadOriginalsEnabled } from "./r2";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOW = /^\/photos\/[a-z0-9/_-]+\.(jpe?g|png|webp|avif)$/i;
const MEM_MAX = 64;

type Cached = { body: Buffer; type: string };
const mem = new Map<string, Cached>();
const r2Miss = new Set<string>();

export async function optimizePhoto(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const src = url.searchParams.get("src") || "";
  const widthRaw = Number(url.searchParams.get("w") || "480");
  if (!ALLOW.test(src)) {
    return new Response("invalid src", { status: 400 });
  }
  const width = PHOTO_WIDTHS.includes(widthRaw as (typeof PHOTO_WIDTHS)[number])
    ? widthRaw
    : 480;

  const accept = request.headers.get("accept") || "";
  const format: "avif" | "webp" | "jpeg" = accept.includes("image/avif")
    ? "avif"
    : accept.includes("image/webp")
      ? "webp"
      : "webp";

  const cacheKey = `${src}|${width}|${format}`;
  const cached = mem.get(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        "content-type": cached.type,
        "cache-control": "public, max-age=31536000, immutable",
        vary: "Accept",
      },
    });
  }

  const buf = await readListingOriginal(src, request);
  if (!buf) return new Response("not found", { status: 404 });
  if (buf.byteLength > MAX_BYTES) return new Response("too large", { status: 413 });

  try {
    let pipeline = sharp(buf, { failOn: "none" }).rotate().resize({
      width,
      withoutEnlargement: true,
    });
    if (format === "avif") pipeline = pipeline.avif({ quality: 42 });
    else if (format === "webp") pipeline = pipeline.webp({ quality: 62 });
    else pipeline = pipeline.jpeg({ quality: 68, mozjpeg: true });
    const out = await pipeline.toBuffer();
    const type = format === "jpeg" ? "image/jpeg" : `image/${format}`;
    mem.set(cacheKey, { body: out, type });
    if (mem.size > MEM_MAX) {
      const first = mem.keys().next().value;
      if (typeof first === "string") mem.delete(first);
    }
    return new Response(out, {
      status: 200,
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
        vary: "Accept",
      },
    });
  } catch {
    return new Response("encode failed", { status: 500 });
  }
}

/**
 * Dual-read: private R2 originals first (when configured), then Git `public/`,
 * then the same-origin `/photos/` static file. A miss or R2 error falls through
 * so listing cards keep working before and after the one-shot migrate.
 */
export async function readListingOriginal(src: string, request?: Request): Promise<Buffer | null> {
  const key = listingSrcToR2Key(src);
  if (key && r2ReadOriginalsEnabled() && !r2Miss.has(key)) {
    try {
      const { getR2Object } = await import("./r2.server");
      const object = await getR2Object(key);
      if (object.body.byteLength && object.body.byteLength <= MAX_BYTES) {
        return object.body;
      }
    } catch {
      r2Miss.add(key);
      if (r2Miss.size > MEM_MAX * 8) {
        const first = r2Miss.values().next().value;
        if (typeof first === "string") r2Miss.delete(first);
      }
    }
  }

  try {
    return await readFile(join(process.cwd(), "public", src.slice(1)));
  } catch {
    if (!request) return null;
    try {
      const origin = new URL(request.url).origin;
      const res = await fetch(`${origin}${src}`);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) return null;
      return Buffer.from(ab);
    } catch {
      return null;
    }
  }
}
