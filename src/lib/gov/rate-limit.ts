/**
 * In-memory limit for one warm server. Demo accounts are tighter.
 * This does not replace a global edge limit.
 */

export const GOV_WINDOW_MS = 10 * 60 * 1000;
export const GOV_LIMIT = 120;
export const GOV_DEMO_LIMIT = 30;

type Bucket = { start: number; used: number };

const buckets = new Map<string, Bucket>();

export function takeGovBudget(
  key: string,
  demo: boolean,
  now = Date.now(),
  store: Map<string, Bucket> = buckets,
): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
  const limit = demo ? GOV_DEMO_LIMIT : GOV_LIMIT;
  const current = store.get(key);
  if (!current || now - current.start >= GOV_WINDOW_MS) {
    store.set(key, { start: now, used: 1 });
    return { ok: true, remaining: limit - 1 };
  }
  if (current.used >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((GOV_WINDOW_MS - (now - current.start)) / 1000));
    return { ok: false, retryAfterSec };
  }
  current.used += 1;
  return { ok: true, remaining: limit - current.used };
}

export function resetGovBudget(store: Map<string, Bucket> = buckets): void {
  store.clear();
}
