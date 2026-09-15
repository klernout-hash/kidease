import { stripLocalePrefix } from "./locale-path.ts";

/**
 * Secondary marketing / info pages opened from the hamburger Menu tab.
 * Hierarchical back belongs here — not on Search / Saved / Enrolled /
 * Messages / Menu, and not on listing, compare, or auth stacks.
 *
 * `/how-it-works` redirects to `/#how`, so it is omitted.
 */
export const MENU_LEAF_PATHS = [
  "/get-app",
  "/benefits",
  "/about",
  "/start-a-daycare",
  "/donate",
  "/team",
  "/contact",
  "/tour-checklist",
  "/claim",
  "/jobs",
  "/jobs/post",
  "/help",
  "/faq",
  "/privacy",
  "/terms",
  "/cookies",
  "/verify",
  "/daycare-requirements",
  "/notifications",
] as const;

export type MenuLeafPath = (typeof MENU_LEAF_PATHS)[number];

const LEAVES = new Set<string>(MENU_LEAF_PATHS);

/** App hamburger destination. Unpaired — there is no `/fr/menu`. */
export const MENU_ROUTE = "/menu" as const;

export function isMenuLeafPath(pathname: string | null | undefined): boolean {
  return LEAVES.has(stripLocalePrefix(pathname));
}

export type HistoryWindow = {
  history: { length: number; state: unknown };
  location: { origin: string; pathname?: string; href?: string };
  document: { referrer: string };
};

function tsrHistoryIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const rec = state as Record<string, unknown>;
  if (typeof rec.__TSR_index === "number") return rec.__TSR_index;
  if (typeof rec.idx === "number") return rec.idx;
  const nested = rec.__TSR;
  if (nested && typeof nested === "object" && typeof (nested as { index?: unknown }).index === "number") {
    return (nested as { index: number }).index;
  }
  return null;
}

/**
 * True when in-app history can go back without leaving KidEase.
 * Direct landings (SEO, shared link, refresh of a deep URL) should fall
 * through to {@link MENU_ROUTE} instead of `history.back()`.
 */
export function canNavigateBackInApp(win: HistoryWindow): boolean {
  const index = tsrHistoryIndex(win.history.state);
  if (index != null && index > 0) return true;

  const referrer = win.document.referrer;
  if (!referrer) return false;
  try {
    const url = new URL(referrer);
    if (url.origin !== win.location.origin) return false;
    const from = stripLocalePrefix(url.pathname);
    const here = stripLocalePrefix(win.location.pathname ?? new URL(win.location.href ?? "https://www.kidease.ca/").pathname);
    return from !== here;
  } catch {
    return false;
  }
}
