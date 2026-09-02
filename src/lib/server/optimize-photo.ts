import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { PHOTO_WIDTHS } from "@/lib/photo";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOW = /^\/photos\/[a-z0-9/_-]+\.(jpe?g|png|webp|avif)$/i;

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
      : "jpeg";

  let buf: Buffer;
  try {
    buf = await readFile(join(process.cwd(), "public", src.slice(1)));
  } catch {
    try {
      const origin = new URL(request.url).origin;
      const res = await fetch(`${origin}${src}`);
      if (!res.ok) return new Response("not found", { status: 404 });
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) return new Response("too large", { status: 413 });
      buf = Buffer.from(ab);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }

  try {
    let pipeline = sharp(buf, { failOn: "none" }).rotate().resize({
      width,
      withoutEnlargement: true,
    });
    if (format === "avif") pipeline = pipeline.avif({ quality: 48 });
    else if (format === "webp") pipeline = pipeline.webp({ quality: 70 });
    else pipeline = pipeline.jpeg({ quality: 72, mozjpeg: true });
    const out = await pipeline.toBuffer();
    return new Response(out, {
      status: 200,
      headers: {
        "content-type": format === "jpeg" ? "image/jpeg" : `image/${format}`,
        "cache-control": "public, max-age=31536000, immutable",
        vary: "Accept",
      },
    });
  } catch {
    return new Response("encode failed", { status: 500 });
  }
}
