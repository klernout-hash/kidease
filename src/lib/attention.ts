/** One shared attention payload. Every badge reads these numbers so they match. */
export type AttentionCounts = {
  messages: number;
  notifications: number;
  requests: number;
  signups: number;
  reviews: number;
  claims: number;
};

export const EMPTY_ATTENTION: AttentionCounts = {
  messages: 0,
  notifications: 0,
  requests: 0,
  signups: 0,
  reviews: 0,
  claims: 0,
};

export type AttentionKey = keyof AttentionCounts;

const ITEM_KEY: Record<string, AttentionKey> = {
  messages: "messages",
  notifications: "notifications",
  requests: "requests",
  bookings: "requests",
  queue: "claims",
  verify: "claims",
  reviews: "reviews",
  people: "signups",
  incomplete: "signups",
};

export function attentionKeyForItem(id: string): AttentionKey | null {
  return ITEM_KEY[id] ?? null;
}

export function attentionForItem(attention: AttentionCounts | null | undefined, id: string): number {
  const key = attentionKeyForItem(id);
  if (!key || !attention) return 0;
  const value = Number(attention[key]) || 0;
  return value > 0 ? value : 0;
}

/** Hidden at 0. Capped at 99+. */
export function formatAttention(count: number): string | null {
  const value = Math.floor(Number(count) || 0);
  if (value < 1) return null;
  if (value > 99) return "99+";
  return String(value);
}

/** Sum each bucket once so a hamburger total cannot double-count the same queue. */
export function attentionTotal(attention: AttentionCounts | null | undefined, ids?: string[]): number {
  if (!attention) return 0;
  const keys = new Set<AttentionKey>();
  if (!ids) {
    (Object.keys(EMPTY_ATTENTION) as AttentionKey[]).forEach((key) => keys.add(key));
  } else {
    for (const id of ids) {
      const key = attentionKeyForItem(id);
      if (key) keys.add(key);
    }
  }
  let sum = 0;
  for (const key of keys) sum += Math.max(0, Number(attention[key]) || 0);
  return sum;
}
