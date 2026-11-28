/**
 * N-67: things this device remembers about the person who was signed in.
 * Sign out drops them so the next person on a shared phone or tablet does
 * not see the last person's recently viewed daycares, their "pick up where
 * you left off" link, their searches or their saved search place and budget.
 *
 * Device settings (language, theme, text size) are not listed here. They
 * belong to the device, not the account.
 *
 * No app imports, so node tests load this file directly.
 */

export const ACCOUNT_SCOPED_LOCAL_KEYS = [
  "kidease-recent",
  "kidease-resume-path",
  "kidease-recent-searches",
  "kidease-search-memory",
] as const;

/** Lets open screens (for example the home "Recently viewed" row) refresh. */
export const ACCOUNT_SCOPED_CLEARED_EVENTS = ["kidease-recent"] as const;

export function clearAccountScopedStorage(storage?: Pick<Storage, "removeItem"> | null): void {
  let target = storage ?? null;
  if (!target) {
    if (typeof window === "undefined") return;
    try {
      target = window.localStorage;
    } catch {
      return;
    }
  }
  for (const key of ACCOUNT_SCOPED_LOCAL_KEYS) {
    try {
      target.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    for (const name of ACCOUNT_SCOPED_CLEARED_EVENTS) {
      try {
        window.dispatchEvent(new Event(name));
      } catch {
        /* old WebView without Event constructor */
      }
    }
  }
}
