/** Parent text size. Browser pinch zoom stays on. This only changes the root font size. */

export const TEXT_SCALES = ["md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

const STORAGE_KEY = "kidease-text-scale";

export function isTextScale(value: string | null | undefined): value is TextScale {
  return value === "md" || value === "lg" || value === "xl";
}

/** Relative to the site's 14px root. 1 leaves the current size unchanged. */
export function textScaleFactor(scale: TextScale): string {
  if (scale === "lg") return "1.125";
  if (scale === "xl") return "1.25";
  return "1";
}

export function textScalePercent(scale: TextScale): string {
  if (scale === "lg") return "112.5%";
  if (scale === "xl") return "125%";
  return "100%";
}

export function readTextScale(): TextScale {
  if (typeof window === "undefined") return "md";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTextScale(raw) ? raw : "md";
  } catch {
    return "md";
  }
}

export function applyTextScale(
  scale: TextScale,
  root: {
    style: { fontSize: string; setProperty?: (name: string, value: string) => void };
    dataset: { textScale?: string };
  } | null = typeof document === "undefined" ? null : document.documentElement,
) {
  if (!root) return;
  // The stylesheet sizes the page at 14px. An inline 100% would jump that to 16px.
  root.style.fontSize = "";
  root.style.setProperty?.("--ke-text-scale", textScaleFactor(scale));
  root.dataset.textScale = scale;
}

export function writeTextScale(scale: TextScale) {
  applyTextScale(scale);
  try {
    window.localStorage.setItem(STORAGE_KEY, scale);
  } catch {
    /* private mode */
  }
}
