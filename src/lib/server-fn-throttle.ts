/**
 * In-memory token bucket for TanStack server functions.
 * One warm isolate only — enough to cheaply shed a stuck tab, not a global ban.
 * Missing CF-Connecting-IP fails open so a header we cannot trust never locks
 * a visitor out.
 */

export const SERVER_FN_BURST = 48;
export const SERVER_FN_REFILL_PER_SEC = 3;
export const SERVER_FN_NAME_BURST = 20;
export const SERVER_FN_NAME_REFILL_PER_SEC = 2;

export type TokenBucket = { tokens: number; ts: number };

export type ThrottleDecision =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

type Store = Map<string, TokenBucket>;

const buckets: Store = new Map();

export function clientIpFromHeaders(headers: { get(name: string): string | null } | null | undefined): string {
  const cf = headers?.get("cf-connecting-ip")?.trim() || headers?.get("CF-Connecting-IP")?.trim();
  if (!cf) return "";
  // One address. A list would mean the header was not overwritten by Cloudflare.
  if (cf.includes(",")) return "";
  return cf.slice(0, 80);
}

export function takeToken(
  bucket: TokenBucket | undefined,
  now: number,
  capacity: number,
  refillPerSec: number,
): { ok: true; bucket: TokenBucket } | { ok: false; bucket: TokenBucket; retryAfterSec: number } {
  const prev = bucket ?? { tokens: capacity, ts: now };
  const elapsedSec = Math.max(0, now - prev.ts) / 1000;
  const tokens = Math.min(capacity, prev.tokens + elapsedSec * refillPerSec);
  if (tokens < 1) {
    const retryAfterSec = Math.max(1, Math.ceil((1 - tokens) / refillPerSec));
    return { ok: false, bucket: { tokens, ts: now }, retryAfterSec };
  }
  return { ok: true, bucket: { tokens: tokens - 1, ts: now } };
}

export function consumeServerFnBudget(
  ip: string,
  fnName: string,
  now = Date.now(),
  store: Store = buckets,
): ThrottleDecision {
  if (!ip) return { ok: true };
  const globalKey = `ip:${ip}`;
  const global = takeToken(store.get(globalKey), now, SERVER_FN_BURST, SERVER_FN_REFILL_PER_SEC);
  store.set(globalKey, global.bucket);
  if (!global.ok) return { ok: false, retryAfterSec: global.retryAfterSec };

  const name = (fnName || "").trim();
  if (!name) return { ok: true };
  const nameKey = `ip:${ip}:fn:${name}`;
  const named = takeToken(store.get(nameKey), now, SERVER_FN_NAME_BURST, SERVER_FN_NAME_REFILL_PER_SEC);
  store.set(nameKey, named.bucket);
  if (!named.ok) return { ok: false, retryAfterSec: named.retryAfterSec };

  if (store.size > 4000) {
    const oldest = store.keys().next().value;
    if (typeof oldest === "string") store.delete(oldest);
  }
  return { ok: true };
}

/** Test hook. */
export function resetServerFnBudget(store: Store = buckets): void {
  store.clear();
}
