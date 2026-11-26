/**
 * One get-session request at a time, a short shared cache, and a calm retry
 * on 429. Rapid page loads used to fire get-session from several places at
 * once, hit the limiter, and leave desks on skeletons for 16 s+ (B03a).
 * Only GET .../get-session goes through here; every other auth call is untouched.
 */
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type Cached = { at: number; status: number; body: string; headers: [string, string][] };

export const SESSION_CACHE_MS = 2_000;
export const SESSION_RETRY_MAX = 2;
export const SESSION_RETRY_CAP_MS = 4_000;

export function isSessionRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") return false;
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(raw, "http://local").pathname.replace(/\/+$/, "").endsWith("/get-session");
  } catch {
    return false;
  }
}

/** Retry-After seconds (or a date), else a short backoff. Never longer than the cap. */
export function sessionRetryDelayMs(retryAfter: string | null, attempt: number, cap = SESSION_RETRY_CAP_MS): number {
  const fallback = 500 * 2 ** Math.max(0, attempt);
  if (!retryAfter) return Math.min(cap, fallback);
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(cap, Math.max(250, secs * 1000));
  const when = Date.parse(retryAfter);
  if (Number.isFinite(when)) return Math.min(cap, Math.max(250, when - Date.now()));
  return Math.min(cap, fallback);
}

export function createSessionFetch(base: FetchLike, opts: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let inflight: Promise<Cached> | null = null;
  let cached: Cached | null = null;

  const toResponse = (row: Cached) => new Response(row.body, { status: row.status, headers: row.headers });

  async function load(input: RequestInfo | URL, init?: RequestInit): Promise<Cached> {
    let attempt = 0;
    for (;;) {
      const res = await base(input, init);
      if (res.status === 429 && attempt < SESSION_RETRY_MAX) {
        await sleep(sessionRetryDelayMs(res.headers.get("retry-after"), attempt));
        attempt += 1;
        continue;
      }
      const row: Cached = { at: now(), status: res.status, body: await res.text(), headers: [...res.headers.entries()] };
      if (res.ok) cached = row;
      return row;
    }
  }

  const fetchImpl: FetchLike = async (input, init) => {
    if (!isSessionRead(input, init)) {
      // Sign-in, sign-out and every write change the session: drop the copy.
      cached = null;
      return base(input, init);
    }
    if (cached && now() - cached.at < SESSION_CACHE_MS) return toResponse(cached);
    if (!inflight) {
      inflight = load(input, init).finally(() => {
        inflight = null;
      });
    }
    return toResponse(await inflight);
  };

  return {
    fetch: fetchImpl,
    clear() {
      cached = null;
    },
  };
}
