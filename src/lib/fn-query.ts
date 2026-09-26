/**
 * Client guards for server-function reads.
 * A signed-in render used to rebuild the user object every time, so effects
 * that stored fresh arrays called the same server functions again forever.
 * These helpers keep a repeat from hitting the network inside staleTime,
 * and keep background polls at a human pace.
 */

export const QUERY_STALE_MS = 30_000;
export const MIN_POLL_MS = 30_000;
export const MAX_POLL_BACKOFF_MS = 5 * 60_000;

type Entry<T> = {
  at: number;
  value?: T;
  pending?: Promise<T>;
  ok: boolean;
};

const store = new Map<string, Entry<unknown>>();

export function pollBackoffMs(failedAttempts: number, base = MIN_POLL_MS): number {
  const n = Math.max(1, Math.floor(failedAttempts));
  const delay = base * 2 ** Math.min(n - 1, 4);
  return Math.min(MAX_POLL_BACKOFF_MS, Math.max(MIN_POLL_MS, delay));
}

export function dedupedQuery<T>(
  key: string,
  staleMs: number,
  fn: () => Promise<T>,
  opts?: { cacheIf?: (value: T) => boolean; fresh?: boolean },
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (!opts?.fresh) {
    if (hit?.pending) return hit.pending;
    if (hit?.ok && now - hit.at < staleMs) return Promise.resolve(hit.value as T);
  }

  const pending = fn()
    .then((value) => {
      if (opts?.cacheIf && !opts.cacheIf(value)) {
        store.delete(key);
        return value;
      }
      store.set(key, { at: Date.now(), value, ok: true });
      return value;
    })
    .catch((err: unknown) => {
      const cur = store.get(key) as Entry<T> | undefined;
      if (cur?.pending) store.delete(key);
      throw err;
    });

  store.set(key, {
    at: hit?.at ?? 0,
    value: hit?.value,
    ok: Boolean(hit?.ok),
    pending,
  });
  if (store.size > 200) {
    const oldest = store.keys().next().value;
    if (typeof oldest === "string") store.delete(oldest);
  }
  return pending;
}

/** Test hook. */
export function resetDedupedQueries(): void {
  store.clear();
}
