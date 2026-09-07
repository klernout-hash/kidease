export const PHOTO_WIDTHS = [320, 480, 768, 1200] as const;
export const CARD_SIZES = "(max-width: 767px) 172px, (max-width: 1023px) 44vw, 320px";
export const HERO_SIZES = "(max-width: 767px) 100vw, 560px";
export const DETAIL_SIZES = "(max-width: 767px) 100vw, 720px";

/** Production public r2.dev host for listing originals. Not a secret. */
export const R2_PUBLIC_DEV_ORIGIN = "https://pub-9e5f137809844fcdb6d6671cd909f312.r2.dev";

export const R2_PUBLIC_BASE_ENV = "R2_PUBLIC_BASE_URL";
export const VITE_R2_PUBLIC_BASE_ENV = "VITE_R2_PUBLIC_BASE_URL";

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

/** Accept only https://*.r2.dev origins. Never the S3 API host. */
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
  if (!host.endsWith(".r2.dev") || host === "r2.dev" || host.includes("..")) return "";
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

/**
 * Prefix a catalogue `/photos/…` path with the public R2 origin.
 * Does not invent paths — listingPhotosFor still owns id→path maps.
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

export function photoUrl(src: string, width: number, env?: PhotoEnv) {
  if (!src) return publicPhotoUrl("/photos/storefront-placeholder-480.webp", env);
  const delivered = publicPhotoUrl(src, env);
  if (!isLocalPhoto(delivered)) return delivered;
  if (src.includes("storefront-placeholder")) return "/photos/storefront-placeholder-480.webp";
  return `/img?src=${encodeURIComponent(src)}&w=${nearestWidth(width)}`;
}

export function photoSrcSet(src: string, widths: readonly number[] = PHOTO_WIDTHS, env?: PhotoEnv) {
  if (!isLocalPhoto(src) || src.includes("storefront-placeholder")) return undefined;
  if (r2PublicBaseUrl(env)) return undefined;
  return widths.map((w) => `${photoUrl(src, w, env)} ${w}w`).join(", ");
}

export { listingThumb, LISTING_PLACEHOLDER } from "./listing-photo.ts";
