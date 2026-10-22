/** Parent text size. Browser pinch zoom stays on. This only changes the root font size. */

export const TEXT_SCALES = ["md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

const STORAGE_KEY = "kidease-text-scale";

export function isTextScale(value: string | null | undefined): value is TextScale {
  return value === "md" || value === "lg" || value === "xl";
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
  root: { style: { fontSize: string }; dataset: { textScale?: string } } | null = typeof document === "undefined"
    ? null
    : document.documentElement,
) {
  if (!root) return;
  root.style.fontSize = textScalePercent(scale);
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
