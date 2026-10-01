/** In-process limits. A cold start resets the window; the call log is the durable record. */

const WINDOW_MS = 60_000;
const USER_LIMIT = 20;
const IP_LIMIT = 30;

type Bucket = { n: number; reset: number };
const hits = new Map<string, Bucket>();

export function resetAiRateLimitForTests() {
  hits.clear();
}

function allow(key: string, limit: number, now: number): boolean {
  const row = hits.get(key);
  if (!row || row.reset <= now) {
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (row.n >= limit) return false;
  row.n += 1;
  return true;
}

export function allowAiCall(input: { userId?: string | null; ipHash?: string | null; now?: number }): boolean {
  const now = input.now ?? Date.now();
  const user = input.userId?.trim();
  const ip = input.ipHash?.trim();
  if (!user && !ip) return false;
  if (user && !allow(`user:${user}`, USER_LIMIT, now)) return false;
  if (ip && !allow(`ip:${ip}`, IP_LIMIT, now)) return false;
  return true;
}
