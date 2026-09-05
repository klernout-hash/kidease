import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { PHOTO_WIDTHS } from "@/lib/photo";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOW = /^\/photos\/[a-z0-9/_-]+\.(jpe?g|png|webp|avif)$/i;
const MEM_MAX = 64;

type Cached = { body: Buffer; type: string };
const mem = new Map<string, Cached>();

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
        "x-kidease-photo-source": "cache",
      },
    });
  }

  let buf: Buffer;
  let source: "r2" | "git" | "origin" = "git";
  try {
    const { tryReadPublicPhotoFromR2 } = await import("@/lib/server/r2.server");
    const fromR2 = await tryReadPublicPhotoFromR2(src);
    if (fromR2 && fromR2.body.byteLength <= MAX_BYTES) {
      buf = fromR2.body;
      source = "r2";
    } else {
      throw new Error("r2-miss");
    }
  } catch {
    try {
      buf = await readFile(join(process.cwd(), "public", src.slice(1)));
      source = "git";
    } catch {
      try {
        const origin = new URL(request.url).origin;
        const res = await fetch(`${origin}${src}`);
        if (!res.ok) return new Response("not found", { status: 404 });
        const ab = await res.arrayBuffer();
        if (ab.byteLength > MAX_BYTES) return new Response("too large", { status: 413 });
        buf = Buffer.from(ab);
        source = "origin";
      } catch {
        return new Response("not found", { status: 404 });
      }
    }
  }

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
        "x-kidease-photo-source": source,
      },
    });
  } catch {
    return new Response("encode failed", { status: 500 });
  }
}
