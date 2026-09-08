import type { LatLng } from "./geo";
import { isInCanada } from "./canada-origin";

export const ANCHOR_MODES = ["home", "work", "both"] as const;
export type AnchorMode = (typeof ANCHOR_MODES)[number];
export type AnchorPoint = LatLng & { label: string };

export const DUAL_ANCHOR_STORAGE_KEY = "kidease-dual-anchor";

export type DualAnchorPrefs = {
  work: AnchorPoint | null;
  mode: AnchorMode;
};

export function parseAnchorMode(value: unknown): AnchorMode {
  return value === "work" || value === "both" ? value : "home";
}

export function isAnchorPoint(value: unknown): value is AnchorPoint {
  if (!value || typeof value !== "object") return false;
  const v = value as { lat?: unknown; lng?: unknown; label?: unknown };
  return (
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng) &&
    typeof v.label === "string" &&
    v.label.trim().length > 0
  );
}

export function isUsableWorkAnchor(work: { lat?: number; lng?: number } | null | undefined) {
  return Boolean(work && Number.isFinite(work.lat) && Number.isFinite(work.lng));
}

/** Home stays the single-origin path unless work exists and mode asks for it. */
export function resolveSearchAnchors(input: {
  home: LatLng;
  work?: { lat: number; lng: number } | null;
  mode?: unknown;
}): {
  primary: LatLng;
  secondary: LatLng | null;
  intersect: boolean;
  mode: AnchorMode;
} {
  const requested = parseAnchorMode(input.mode);
  const work = isUsableWorkAnchor(input.work) ? { lat: input.work!.lat, lng: input.work!.lng } : null;
  if (requested === "work" && work) {
    return { primary: work, secondary: null, intersect: false, mode: "work" };
  }
  if (requested === "both" && work) {
    return { primary: input.home, secondary: work, intersect: true, mode: "both" };
  }
  return { primary: input.home, secondary: null, intersect: false, mode: "home" };
}

export function sanitizeAnchorPoint(value: unknown): AnchorPoint | null {
  if (!isAnchorPoint(value)) return null;
  if (!isInCanada(value.lat, value.lng)) return null;
  return { lat: value.lat, lng: value.lng, label: value.label.trim().slice(0, 160) };
}

export function readDualAnchorPrefs(): DualAnchorPrefs {
  if (typeof window === "undefined") return { work: null, mode: "home" };
  try {
    const raw = window.localStorage.getItem(DUAL_ANCHOR_STORAGE_KEY);
    if (!raw) return { work: null, mode: "home" };
    const v = JSON.parse(raw) as { work?: unknown; mode?: unknown };
    return {
      work: sanitizeAnchorPoint(v.work),
      mode: parseAnchorMode(v.mode),
    };
  } catch {
    return { work: null, mode: "home" };
  }
}

export function writeDualAnchorPrefs(prefs: DualAnchorPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DUAL_ANCHOR_STORAGE_KEY,
      JSON.stringify({
        work: prefs.work ? sanitizeAnchorPoint(prefs.work) : null,
        mode: parseAnchorMode(prefs.mode),
      }),
    );
  } catch {
    /* ignore */
  }
}
