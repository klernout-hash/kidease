/**
 * Native App Store / Play review.
 *
 * Happy-moment in-app sheet (iOS SKStoreReviewController / Play In-App Review):
 *   - Capacitor only. Never on www.
 *   - Never on launch. Only after saved search / share / booking success.
 *   - App-level cooldown (90 days) plus OS quotas. We never fake a 1–5 UI.
 *
 * Menu / Account / guest home “Rate KidEase” / “Write a review”:
 *   - Native: deep-link to write-review store URLs (placeholders until IDs exist).
 *   - Web: caller routes to /get-app. Do not request the native sheet.
 *   - Guest www homepage is intentional (not Account-only). Same helper, no live store API.
 */

import { isNative, nativePlatform, shareText, type NativePlatform } from "./native.ts";
import { STORE } from "./store-listing.ts";

export const STORE_REVIEW_LAST_KEY = "kidease-store-review-last";
/** Respect Apple’s ~3 prompts / year and Play’s quota. Do not prompt every launch. */
export const STORE_REVIEW_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

export const STORE_REVIEW_REASONS = ["saved_search", "share", "booking"] as const;
export type StoreReviewReason = (typeof STORE_REVIEW_REASONS)[number];

export type RateKidEaseResult = "store" | "in-app" | "get-app";

function readPublicEnv(name: string): string {
  const meta = typeof import.meta !== "undefined" ? (import.meta as { env?: Record<string, unknown> }).env : undefined;
  const fromMeta = meta?.[name];
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  if (typeof process !== "undefined") {
    const fromProc = process.env?.[name];
    if (typeof fromProc === "string" && fromProc.trim()) return fromProc.trim();
  }
  return "";
}

/** Numeric App Store ID. Empty placeholder until App Store Connect assigns one. */
export function appleAppStoreId(): string {
  return readPublicEnv("VITE_APPLE_APP_STORE_ID") || STORE.appleAppStoreId.trim();
}

/** Play package. Defaults to the real Capacitor appId — not an invented listing id. */
export function playPackageName(): string {
  return readPublicEnv("VITE_PLAY_PACKAGE_NAME") || STORE.playPackageName.trim();
}

export function isAssignedAppleAppStoreId(id: string): boolean {
  return /^\d{6,12}$/.test(id.trim());
}

export function isPlayPackageName(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id.trim());
}

/** Public App Store listing URL — empty until Apple assigns a numeric ID. Never invent one. */
export function appleStoreListingUrl(id = appleAppStoreId()): string | null {
  const trimmed = id.trim();
  if (!isAssignedAppleAppStoreId(trimmed)) return null;
  return `https://apps.apple.com/app/id${trimmed}`;
}

export function appleWriteReviewUrl(id = appleAppStoreId()): string | null {
  const listing = appleStoreListingUrl(id);
  return listing ? `${listing}?action=write-review` : null;
}

/**
 * Public Play listing URL — only when ops set `VITE_PLAY_STORE_URL`.
 * Package name alone is not a live listing. Do not invent a store URL.
 */
export function playStoreListingUrl(): string | null {
  const raw = readPublicEnv("VITE_PLAY_STORE_URL");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "play.google.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function playWriteReviewUrl(pkg = playPackageName()): string | null {
  const id = pkg.trim();
  if (!isPlayPackageName(id)) return null;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}`;
}

export function writeReviewUrlForPlatform(
  platform: NativePlatform,
  ids?: { appleId?: string; playPackage?: string },
): string | null {
  if (platform === "ios") return appleWriteReviewUrl(ids?.appleId ?? appleAppStoreId());
  if (platform === "android") return playWriteReviewUrl(ids?.playPackage ?? playPackageName());
  return null;
}

export function parseReviewTimestamp(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function reviewCooldownElapsed(
  lastMs: number | null,
  nowMs: number,
  cooldownMs = STORE_REVIEW_COOLDOWN_MS,
): boolean {
  if (lastMs == null || !Number.isFinite(lastMs) || lastMs <= 0) return true;
  if (!Number.isFinite(nowMs) || cooldownMs <= 0) return false;
  return nowMs - lastMs >= cooldownMs;
}

export function isHappyMomentReason(reason: string): reason is StoreReviewReason {
  return (STORE_REVIEW_REASONS as readonly string[]).includes(reason);
}

async function readLastReviewAt(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  if (isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: STORE_REVIEW_LAST_KEY });
      const fromPrefs = parseReviewTimestamp(value);
      if (fromPrefs != null) return fromPrefs;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    return parseReviewTimestamp(window.localStorage.getItem(STORE_REVIEW_LAST_KEY));
  } catch {
    return null;
  }
}

async function writeLastReviewAt(atMs: number): Promise<void> {
  const value = String(atMs);
  if (typeof window === "undefined") return;
  if (isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: STORE_REVIEW_LAST_KEY, value });
    } catch {
      /* localStorage still records the cooldown */
    }
  }
  try {
    window.localStorage.setItem(STORE_REVIEW_LAST_KEY, value);
  } catch {
    /* private mode */
  }
}

async function openExternalUrl(url: string): Promise<boolean> {
  if (!url) return false;
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return true;
    } catch {
      /* fall through */
    }
  }
  if (typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/** Native OS sheet only. Never a custom 1–5 control. Web is a no-op. */
export async function requestInAppReview(opts?: { force?: boolean; now?: number }): Promise<boolean> {
  if (!isNative()) return false;
  const now = opts?.now ?? Date.now();
  if (!opts?.force) {
    const last = await readLastReviewAt();
    if (!reviewCooldownElapsed(last, now)) return false;
  }
  try {
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await writeLastReviewAt(now);
    await InAppReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

/** After a real success. Fire-and-forget. Never called from NativeBoot / launch. */
export function noteHappyMoment(reason: StoreReviewReason): void {
  if (!isHappyMomentReason(reason)) return;
  if (typeof window === "undefined") return;
  if (!isNative()) return;
  void requestInAppReview();
}

export async function shareAndMaybeReview(title: string, text: string, url?: string): Promise<boolean> {
  const attempt = await shareText(title, text, url);
  if (attempt !== "shared") return false;
  noteHappyMoment("share");
  return true;
}

export async function openWriteReview(platform: NativePlatform = nativePlatform()): Promise<boolean> {
  const url = writeReviewUrlForPlatform(platform);
  if (!url) return false;
  return openExternalUrl(url);
}

/**
 * Menu / account / guest home “Rate KidEase”.
 * Native → store write-review URL (or OS sheet if the Apple ID is still a placeholder).
 * Web → caller should send the user to /get-app. Never a fake rating UI.
 * Logged-out www.kidease.ca home uses this same path — Rate KidEase is not Account-only.
 */
export async function rateKidEaseFromMenu(): Promise<RateKidEaseResult> {
  if (isNative()) {
    if (await openWriteReview()) return "store";
    if (await requestInAppReview({ force: true })) return "in-app";
  }
  return "get-app";
}
