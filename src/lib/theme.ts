export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "kidease-theme";
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
/**
 * Kyle 2026-11-28: Light for new visitors and fresh installs. Dark and System
 * stay a choice in Appearance and are remembered (localStorage + account).
 * Keep public/theme-boot.js and the <html> defaults in __root.tsx in step.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

/** Brand navy — matches the existing theme-color meta. */
export const THEME_COLOR_LIGHT = "#1A3790";
/** Header / page background in dark appearance. */
export const THEME_COLOR_DARK = "#101218";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME_PREFERENCE;
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
  if (typeof window === "undefined") return DEFAULT_THEME_PREFERENCE;
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** The guest's explicit choice on this device, or null when nothing was saved. */
export function readStoredThemePreference(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * T1: on sign-in, an account on System (or never set) takes the guest's
 * explicit Light/Dark choice from this device and saves it to the account.
 */
export function signInThemePlan(account: ThemePreference | null, guest: ThemePreference | null): { theme: ThemePreference; save: boolean } {
  if ((account === null || account === "system") && (guest === "light" || guest === "dark")) return { theme: guest, save: true };
  return { theme: account ?? DEFAULT_THEME_PREFERENCE, save: false };
}

export function writeThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore quota / private mode */
  }
}

let themePersister: ((theme: ThemePreference) => void) | null = null;

/** Account save hook. Registered only while someone is signed in. */
export function setThemePersister(next: ((theme: ThemePreference) => void) | null) {
  themePersister = next;
}

export function persistThemePreference(theme: ThemePreference) {
  themePersister?.(theme);
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
