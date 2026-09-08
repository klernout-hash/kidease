export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "kidease-theme";
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

/** Brand navy — matches the existing theme-color meta. */
export const THEME_COLOR_LIGHT = "#1A3790";
/** Header / page background in dark appearance. */
export const THEME_COLOR_DARK = "#14161c";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function prefersDarkScheme(
  query: { matches: boolean } | null = typeof window === "undefined"
    ? null
    : window.matchMedia("(prefers-color-scheme: dark)"),
): boolean {
  return Boolean(query?.matches);
}

export function resolveTheme(preference: ThemePreference, prefersDark = prefersDarkScheme()): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore quota / private mode */
  }
}

export function applyTheme(preference: ThemePreference, root = typeof document === "undefined" ? null : document.documentElement): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (!root) return resolved;
  root.dataset.theme = preference;
  root.dataset.resolvedTheme = resolved;
  root.style.colorScheme = resolved;
  const meta = root.ownerDocument?.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  return resolved;
}

export function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => onChange();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener(listener);
  return () => media.removeListener(listener);
}
