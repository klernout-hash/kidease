/**
 * Proposed KidEase Home / Search / Listing tokens.
 * Documentation export — not imported by `src/` in this PR.
 *
 * Keep hexes in sync with `tokens.css` and TOKENS.md.
 */

export const KIDEASE_PRIMARY = "#1A3790";
export const KIDEASE_PRIMARY_FG = "#FFFFFF";
export const KIDEASE_SOFT = "#EEF2FB";
export const KIDEASE_SOFT_STRONG = "#D5DFF3";
export const KIDEASE_FG = "#1C2438";
export const KIDEASE_MUTED = "#5C6578";
export const KIDEASE_BORDER = "#E3DDD3";
export const KIDEASE_OK = "#1A7A5A";
export const KIDEASE_DANGER = "#B42318";

/** Single card / field / panel corner. */
export const KIDEASE_RADIUS_PX = 14;
/** Chips and Sign-in only. */
export const KIDEASE_PILL_RADIUS_PX = 999;

/** 8pt grid, pixels. */
export const KIDEASE_SPACE = {
  1: 8,
  2: 16,
  3: 24,
  4: 32,
  6: 48,
  8: 64,
} as const;

export const KIDEASE_CONTROL_HEIGHT_PX = 48;

export const KIDEASE_TYPE = {
  display: { size: 40, line: 1.15, weight: 600 },
  title: { size: 24, line: 1.2, weight: 600 },
  section: { size: 20, line: 1.25, weight: 600 },
  body: { size: 16, line: 1.5, weight: 400 },
  meta: { size: 14, line: 1.4, weight: 500 },
  tiny: { size: 12, line: 1.3, weight: 600 },
} as const;

export const KIDEASE_SHADOW_CARD =
  "0 1px 0 rgba(28, 36, 56, 0.04), 0 18px 40px -24px rgba(26, 55, 144, 0.28)";

export const kideaseFeelTokens = {
  color: {
    primary: KIDEASE_PRIMARY,
    primaryFg: KIDEASE_PRIMARY_FG,
    soft: KIDEASE_SOFT,
    softStrong: KIDEASE_SOFT_STRONG,
    fg: KIDEASE_FG,
    muted: KIDEASE_MUTED,
    border: KIDEASE_BORDER,
    ok: KIDEASE_OK,
    danger: KIDEASE_DANGER,
    ring: KIDEASE_PRIMARY,
  },
  radiusPx: KIDEASE_RADIUS_PX,
  pillRadiusPx: KIDEASE_PILL_RADIUS_PX,
  space: KIDEASE_SPACE,
  controlHeightPx: KIDEASE_CONTROL_HEIGHT_PX,
  type: KIDEASE_TYPE,
  shadowCard: KIDEASE_SHADOW_CARD,
  font: "Plus Jakarta Sans",
} as const;

export type KideaseFeelTokens = typeof kideaseFeelTokens;
