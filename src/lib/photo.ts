export const PHOTO_WIDTHS = [320, 480, 768, 1200] as const;
/** Airbnb-density Explore tiles (~184–200px CSS; 320/480 cover 1x–2x). */
export const CARD_WIDTHS = [320, 480, 768] as const;
/** Listing detail hero (~720px CSS; 1200 covers 1.5–2x). */
export const HERO_WIDTHS = [480, 768, 1200] as const;
export const CARD_SIZES = "(max-width: 767px) 172px, (max-width: 1023px) 30vw, 200px";
export const HERO_SIZES = "(max-width: 767px) 100vw, 560px";
export const DETAIL_SIZES = "(max-width: 767px) 100vw, 720px";
/** Home How-it-works stills: 1-col phone, 2-col tablet, ~1/3 desktop. */
export const STEP_SIZES = "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 380px";

/** Production custom domain on bucket kidease-media. Not a secret. r2.dev returns 401. */
export const R2_PUBLIC_MEDIA_ORIGIN = "https://media.kidease.ca";
/** Optional/dev-only r2.dev pub host. Production uses media.kidease.ca. */
export const R2_PUBLIC_DEV_ORIGIN = "https://pub-9e5f137809844fcdb6d6671cd909f312.r2.dev";

export const R2_PUBLIC_BASE_ENV = "R2_PUBLIC_BASE_URL";
export const VITE_R2_PUBLIC_BASE_ENV = "VITE_R2_PUBLIC_BASE_URL";
/** Opt-in Cloudflare Image Transformations on the media host. Default off. */
export const CF_IMAGE_RESIZE_ENV = "CF_IMAGE_RESIZE";
export const VITE_CF_IMAGE_RESIZE_ENV = "VITE_CF_IMAGE_RESIZE";
/** Stable /cdn-cgi/image/ options. Width is appended per request. */
export const CF_IMAGE_TRANSFORM_OPTS = "quality=75,format=auto,fit=scale-down";

export type PhotoEnv = Record<string, string | undefined>;

export function isLocalPhoto(src: string) {
  return src.startsWith("/photos/") && !src.includes("..");
}

function readImportMeta(name: string): string {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const value = env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function processEnv(name: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return String(process.env[name] ?? "").trim();
}

function isAllowedPublicPhotoHost(host: string): boolean {
  if (host === "media.kidease.ca") return true;
  if (host.endsWith(".r2.dev") && host !== "r2.dev" && !host.includes("..")) return true;
  return false;
}

/** Accept https://media.kidease.ca or https://*.r2.dev. Never the S3 API host. */
export function normalizeR2PublicBase(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (url.search || url.hash) return "";
  if (url.pathname && url.pathname !== "/") return "";
  const host = url.hostname.toLowerCase();
  if (!isAllowedPublicPhotoHost(host)) return "";
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return "";
  return url.origin;
}

/** Public media origin when R2_PUBLIC_BASE_URL or VITE_R2_PUBLIC_BASE_URL is set. */
export function r2PublicBaseUrl(env?: PhotoEnv): string {
  const raw = env
    ? String(env[R2_PUBLIC_BASE_ENV] || env[VITE_R2_PUBLIC_BASE_ENV] || "").trim()
    : readImportMeta(VITE_R2_PUBLIC_BASE_ENV) ||
      readImportMeta(R2_PUBLIC_BASE_ENV) ||
      processEnv(R2_PUBLIC_BASE_ENV) ||
      processEnv(VITE_R2_PUBLIC_BASE_ENV);
  return normalizeR2PublicBase(raw);
}

function envFlagOn(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function readEnvValue(env: PhotoEnv | undefined, viteName: string, name: string): string {
  if (env) return String(env[name] || env[viteName] || "").trim();
  return readImportMeta(viteName) || readImportMeta(name) || processEnv(name) || processEnv(viteName);
}

/** True when Kyle set CF_IMAGE_RESIZE / VITE_CF_IMAGE_RESIZE. Absent env = off. */
export function cfImageResizeEnabled(env?: PhotoEnv): boolean {
  return envFlagOn(readEnvValue(env, VITE_CF_IMAGE_RESIZE_ENV, CF_IMAGE_RESIZE_ENV));
}

/** Transformations run on media.kidease.ca only. r2.dev has no /cdn-cgi/image/. */
export function canCfTransformBase(base: string): boolean {
  if (!base) return false;
  try {
    return new URL(base).hostname.toLowerCase() === "media.kidease.ca";
  } catch {
    return false;
  }
}

export function isCfImageTransformUrl(url: string): boolean {
  if (!url) return false;
  try {
    return new URL(url, R2_PUBLIC_MEDIA_ORIGIN).pathname.startsWith("/cdn-cgi/image/");
  } catch {
    return false;
  }
}

/** Sized AVIF/WebP delivery (`/img` or CF transform). Originals stay at /photos/…. */
export function isResizedPhotoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/img?") || url.startsWith("/img&")) return true;
  try {
    const parsed = new URL(url, R2_PUBLIC_MEDIA_ORIGIN);
    return parsed.pathname === "/img" || parsed.pathname.startsWith("/cdn-cgi/image/");
  } catch {
    return false;
  }
}

export function srcsetWidthsFor(displayWidth: number): readonly number[] {
  return displayWidth >= 720 ? HERO_WIDTHS : CARD_WIDTHS;
}

/**
 * Prefix a catalogue `/photos/…` path with the public R2 origin.
 * Does not invent paths — listingPhotosFor still owns id→path maps.
 * Never wraps /cdn-cgi/image/ — originals stay at ${base}/photos/….
 */
export function publicPhotoUrl(src: string, env?: PhotoEnv): string {
  if (!src) return src;
  if (!isLocalPhoto(src)) return src;
  const base = r2PublicBaseUrl(env);
  if (!base) return src;
  return `${base}${src}`;
}

function nearestWidth(width: number) {
  return PHOTO_WIDTHS.find((n) => n >= width) ?? 1200;
}

/** Same-origin CF transform. Source path is the catalogue /photos/… key. */
export function cfImageTransformUrl(src: string, width: number, base: string): string {
  const w = nearestWidth(width);
  return `${base}/cdn-cgi/image/width=${w},${CF_IMAGE_TRANSFORM_OPTS}${src}`;
}

/** Sized AVIF/WebP URL. Catalogue path stays `/photos/…`; originals stay on media.kidease.ca. */
export function photoUrl(src: string, width: number, env?: PhotoEnv) {
  if (!src) return publicPhotoUrl("/photos/storefront-placeholder-480.webp", env);
  if (src.includes("storefront-placeholder")) {
    const placeholder = publicPhotoUrl(src, env);
    if (!isLocalPhoto(placeholder)) return placeholder;
    return "/photos/storefront-placeholder-480.webp";
  }
  if (!isLocalPhoto(src)) return src;
  const base = r2PublicBaseUrl(env);
  if (base && cfImageResizeEnabled(env) && canCfTransformBase(base)) {
    return cfImageTransformUrl(src, width, base);
  }
  return `/img?src=${encodeURIComponent(src)}&w=${nearestWidth(width)}`;
}

export function photoSrcSet(src: string, widths: readonly number[] = PHOTO_WIDTHS, env?: PhotoEnv) {
  if (!isLocalPhoto(src) || src.includes("storefront-placeholder")) return undefined;
  return widths.map((w) => `${photoUrl(src, w, env)} ${w}w`).join(", ");
}

export { listingThumb, LISTING_PLACEHOLDER } from "./listing-photo.ts";
