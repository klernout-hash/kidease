/**
 * Centres a guest taps Save on, before they have an account.
 * Applied to saved_daycares after sign-up. No names are required to persist.
 */

export const GUEST_SHORTLIST_KEY = "kidease-guest-shortlist";
export const MAX_GUEST_SHORTLIST = 20;

export type GuestShortlistItem = {
  id: string;
  name?: string;
  slug?: string;
  city?: string;
};

function isValidDaycareId(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const id = raw.trim();
  return id.length >= 2 && id.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(id);
}

export type GuestStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function guestStorage(): GuestStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cleanItem(raw: unknown): GuestShortlistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as GuestShortlistItem;
  if (!isValidDaycareId(row.id)) return null;
  const item: GuestShortlistItem = { id: row.id.trim() };
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  const city = typeof row.city === "string" ? row.city.trim() : "";
  if (name) item.name = name.slice(0, 120);
  if (slug) item.slug = slug.slice(0, 80);
  if (city) item.city = city.slice(0, 80);
  return item;
}

export function readGuestShortlist(storage: GuestStorage | null = guestStorage()): GuestShortlistItem[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(GUEST_SHORTLIST_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: GuestShortlistItem[] = [];
    for (const row of parsed) {
      const item = cleanItem(row);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= MAX_GUEST_SHORTLIST) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeGuestShortlist(items: readonly GuestShortlistItem[], storage: GuestStorage | null = guestStorage()) {
  if (!storage) return;
  const seen = new Set<string>();
  const out: GuestShortlistItem[] = [];
  for (const row of items) {
    const item = cleanItem(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= MAX_GUEST_SHORTLIST) break;
  }
  try {
    if (!out.length) storage.removeItem(GUEST_SHORTLIST_KEY);
    else storage.setItem(GUEST_SHORTLIST_KEY, JSON.stringify(out));
  } catch {
    /* private mode */
  }
}

export function addGuestShortlist(item: GuestShortlistItem, storage: GuestStorage | null = guestStorage()) {
  const clean = cleanItem(item);
  if (!clean) return;
  const rest = readGuestShortlist(storage).filter((row) => row.id !== clean.id);
  writeGuestShortlist([clean, ...rest], storage);
}

/** Read and clear. Sign-up applies these ids once. */
export function takeGuestShortlist(storage: GuestStorage | null = guestStorage()): GuestShortlistItem[] {
  const rows = readGuestShortlist(storage);
  if (storage) {
    try {
      storage.removeItem(GUEST_SHORTLIST_KEY);
    } catch {
      /* ignore */
    }
  }
  return rows;
}
