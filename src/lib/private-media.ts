/**
 * Private photos for daily logs and learning stories.
 * FEATURE_PRIVATE_MEDIA defaults off. On: only a short-lived signed link is returned.
 * A public URL is never a substitute.
 */
import { privateMediaEnabled, type EnvMap } from "./features.ts";

export const PRIVATE_MEDIA_KINDS = ["daily-log", "learning-story"] as const;
export type PrivateMediaKind = (typeof PRIVATE_MEDIA_KINDS)[number];

export const PRIVATE_MEDIA_TTL_SEC = 15 * 60;
export const PRIVATE_MEDIA_TTL_MAX_SEC = 60 * 60;

const KEY_RE = /^private\/(daily-log|learning-story)\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9._-]{1,120}$/;

export function privateMediaKey(kind: PrivateMediaKind, daycareId: string, fileName: string): string | null {
  const centre = String(daycareId || "").trim();
  const file = String(fileName || "").trim().replace(/[^A-Za-z0-9._-]/g, "");
  if (!centre || !/^[A-Za-z0-9_-]{1,80}$/.test(centre) || !file) return null;
  const key = `private/${kind}/${centre}/${file}`;
  return isPrivateMediaKey(key) ? key : null;
}

export function isPrivateMediaKey(value: string | null | undefined): boolean {
  return KEY_RE.test(String(value || "").trim());
}

export function privateMediaKind(key: string): PrivateMediaKind | null {
  const match = KEY_RE.exec(String(key || "").trim());
  if (!match) return null;
  return match[1] === "learning-story" ? "learning-story" : "daily-log";
}

/** An https link without a signature, or a public image path. */
export function isPublicMediaUrl(value: string | null | undefined): boolean {
  const src = String(value || "").trim();
  if (!src) return false;
  if (src.startsWith("/img") || src.startsWith("/photos/") || src.startsWith("/img?")) return true;
  if (/^https?:\/\//i.test(src)) return !/[?&]X-Amz-Signature=/i.test(src);
  return false;
}

export function clampPrivateTtl(seconds?: number | null): number {
  const n = Number(seconds ?? PRIVATE_MEDIA_TTL_SEC);
  if (!Number.isFinite(n)) return PRIVATE_MEDIA_TTL_SEC;
  return Math.min(PRIVATE_MEDIA_TTL_MAX_SEC, Math.max(60, Math.round(n)));
}

export function presentPrivatePhoto(
  src: string,
  options: {
    enabled: boolean;
    sign?: (key: string, expiresIn: number) => string | null;
    expiresIn?: number;
  },
): { src: string; expiresIn: number } | null {
  const value = String(src || "").trim();
  if (!options.enabled) {
    if (!value || isPublicMediaUrl(value) || isPrivateMediaKey(value) || value.startsWith("data:image/")) {
      return value ? { src: value, expiresIn: 0 } : null;
    }
    return null;
  }
  if (!isPrivateMediaKey(value) || !options.sign) return null;
  const expiresIn = clampPrivateTtl(options.expiresIn);
  const signed = options.sign(value, expiresIn);
  if (!signed || !/[?&]X-Amz-Signature=/i.test(signed)) return null;
  return { src: signed, expiresIn };
}

export function carePhotosForViewer(
  photos: ReadonlyArray<{ src: string; name?: string }>,
  options: {
    enabled?: boolean;
    env?: EnvMap;
    sign?: (key: string, expiresIn: number) => string | null;
    expiresIn?: number;
  },
): Array<{ src: string; name?: string; expiresIn: number }> {
  const enabled = options.enabled ?? privateMediaEnabled(options.env);
  const out: Array<{ src: string; name?: string; expiresIn: number }> = [];
  for (const photo of photos) {
    const shown = presentPrivatePhoto(photo.src, { ...options, enabled });
    if (!shown) continue;
    if (enabled && isPublicMediaUrl(shown.src)) continue;
    out.push({ src: shown.src, name: photo.name, expiresIn: shown.expiresIn });
  }
  return out;
}

export function privatePhotoAccepted(src: string, enabled: boolean): boolean {
  if (!enabled) return true;
  return isPrivateMediaKey(src);
}
