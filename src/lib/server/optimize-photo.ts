import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { listingStemFromSrc, shouldReplaceWithPerListingPlaceholder } from "../photo-honesty.ts";
import { PHOTO_WIDTHS, canCfTransformBase, publicPhotoUrl, r2PublicBaseUrl } from "../photo.ts";
import { listingSrcToR2Key, r2ReadOriginalsEnabled, sha256Hex } from "./r2.ts";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOW = /^\/photos\/[a-z0-9/_-]+\.(jpe?g|png|webp|avif)$/i;
const MEM_MAX = 64;

type Cached = { body: Buffer; type: string; placeholder: boolean };
const mem = new Map<string, Cached>();
const r2Miss = new Set<string>();

function photoHeaders(type: string, placeholder: boolean): HeadersInit {
  const cache = placeholder ? "public, max-age=86400" : "public, max-age=31536000, immutable";
  return {
    "content-type": type,
    "cache-control": cache,
    "cdn-cache-control": cache,
    "cloudflare-cdn-cache-control": cache,
    vary: "Accept",
    ...(placeholder ? { "x-kidease-photo": "per-listing-placeholder" } : {}),
  };
}

/** Distinct pixels per listing without drawing text. librsvg has no UI font, so <text> becomes tofu. */
function placeholderShift(stem: string): number {
  let n = 2166136261;
  for (let i = 0; i < stem.length; i++) {
    n ^= stem.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0) % 28;
}

export async function encodePerListingPlaceholder(
  src: string,
  width: number,
  format: "avif" | "webp",
): Promise<Buffer> {
  const shift = placeholderShift(listingStemFromSrc(src));
  const height = Math.max(1, Math.round((width * 3) / 4));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="#E8E4DC"/>
    <circle cx="${500 + shift}" cy="64" r="22" fill="#1a3790" opacity="0.18"/>
    <g fill="none" stroke="#1a3790" stroke-width="3" opacity="0.28">
      <path d="M48 150V96h70v54"/>
      <path d="M83 96v54M48 123h70"/>
      <path d="M470 360v-72h92v72"/>
      <path d="M458 288h116L516 246z"/>
    </g>
    <g fill="#1a3790" opacity="0.22">
      <rect x="508" y="312" width="18" height="48" rx="1"/>
      <rect x="40" y="338" width="36" height="36" rx="4"/>
      <rect x="66" y="316" width="30" height="30" rx="4"/>
      <rect x="88" y="350" width="24" height="24" rx="3"/>
      <circle cx="${598 - (shift % 8)}" cy="330" r="18"/>
      <rect x="592" y="330" width="10" height="32"/>
    </g>
  </svg>`;
  let pipeline = sharp(Buffer.from(svg)).resize({ width, withoutEnlargement: true });
  if (format === "avif") pipeline = pipeline.avif({ quality: 42 });
  else pipeline = pipeline.webp({ quality: 62 });
  return pipeline.toBuffer();
}

export async function optimizePhoto(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const src = url.searchParams.get("src") || "";
  const widthRaw = Number(url.searchParams.get("w") || "480");
  if (!ALLOW.test(src)) {
    return new Response("invalid src", { status: 400 });
  }
  const width = PHOTO_WIDTHS.includes(widthRaw as (typeof PHOTO_WIDTHS)[number]) ? widthRaw : 480;

  const accept = request.headers.get("accept") || "";
  const format: "avif" | "webp" = accept.includes("image/avif") ? "avif" : "webp";

  const cacheKey = `${src}|${width}|${format}`;
  const cached = mem.get(cacheKey);
  if (cached) {
    return new Response(new Uint8Array(cached.body), {
      status: 200,
      headers: photoHeaders(cached.type, cached.placeholder),
    });
  }

  const buf = await readListingOriginal(src, request);
  if (!buf || buf.byteLength > MAX_BYTES) {
    try {
      const out = await encodePerListingPlaceholder(src, width, format);
      const type = `image/${format}`;
      const cachedMiss = { body: out, type, placeholder: true };
      mem.set(cacheKey, cachedMiss);
      return new Response(new Uint8Array(out), {
        status: 200,
        headers: photoHeaders(type, true),
      });
    } catch {
      return new Response("encode failed", { status: 500 });
    }
  }

  const placeholder = shouldReplaceWithPerListingPlaceholder(src, sha256Hex(buf));

  try {
    const out = placeholder
      ? await encodePerListingPlaceholder(src, width, format)
      : await encodeListingOriginal(buf, width, format);
    const type = `image/${format}`;
    mem.set(cacheKey, { body: out, type, placeholder });
    if (mem.size > MEM_MAX) {
      const first = mem.keys().next().value;
      if (typeof first === "string") mem.delete(first);
    }
    return new Response(new Uint8Array(out), {
      status: 200,
      headers: photoHeaders(type, placeholder),
    });
  } catch {
    return new Response("encode failed", { status: 500 });
  }
}

async function encodeListingOriginal(
  buf: Buffer,
  width: number,
  format: "avif" | "webp",
): Promise<Buffer> {
  let pipeline = sharp(buf, { failOn: "none" }).rotate().resize({
    width,
    withoutEnlargement: true,
  });
  if (format === "avif") pipeline = pipeline.avif({ quality: 42 });
  else pipeline = pipeline.webp({ quality: 62 });
  return pipeline.toBuffer();
}

/**
 * Dual-read: private R2 originals first (when configured), then Git `public/`,
 * then the public media host (`https://media.kidease.ca/photos/…`), then the
 * same-origin `/photos/` static file. A miss or R2 error falls through so
 * listing cards keep working before and after the one-shot migrate.
 * Catalogue paths stay `/photos/…` — this only reads the original object.
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
    const remote = await readPublicMediaOriginal(src);
    if (remote) return remote;
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

/** Fetch the unchanged public object at media.kidease.ca/photos/…. Never r2.dev. */
async function readPublicMediaOriginal(src: string): Promise<Buffer | null> {
  const base = r2PublicBaseUrl();
  if (!base || !canCfTransformBase(base)) return null;
  const url = publicPhotoUrl(src);
  if (!url.startsWith("https://media.kidease.ca/photos/")) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}
