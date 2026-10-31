/**
 * Screen-reader pass. FEATURE_A11Y_PASS defaults off.
 * Punjabi, Tagalog, and Simplified Chinese already ship in the language packs.
 * This file adds the skip-link labels for those languages.
 */

export const A11Y_PASS_FLAG = "FEATURE_A11Y_PASS";

const SKIP: Record<string, string> = {
  en: "Skip to main content",
  fr: "Aller au contenu principal",
  zh: "跳到主要内容",
  pa: "ਮੁੱਖ ਸਮੱਗਰੀ ਤੇ ਜਾਓ",
  tl: "Lumaktaw sa pangunahing nilalaman",
};

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function a11yPassEnabled(env?: Record<string, string | undefined>): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[A11Y_PASS_FLAG]) || flagOn(bag[`VITE_${A11Y_PASS_FLAG}`]);
}

export function skipLinkLabel(locale: string): string {
  return SKIP[locale] ?? SKIP.en;
}

/** Relative luminance contrast. WCAG 2.2 AA text needs 4.5. */
export function contrastRatio(foreground: string, background: string): number {
  const L1 = luminance(foreground);
  const L2 = luminance(background);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const value = parseInt(raw.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export const A11Y_PAIRS = [
  { name: "text on background", fg: "#1c2438", bg: "#f6f3ee" },
  { name: "muted on surface", fg: "#5c6578", bg: "#fffcf8" },
  { name: "primary button", fg: "#ffffff", bg: "#1a3790" },
] as const;
