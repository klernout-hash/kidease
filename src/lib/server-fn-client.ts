/**
 * Stop a render loop from hammering `/_serverFn`.
 *
 * TanStack does not retry a server function on its own. A new effect run
 * starts a new POST. After a 429 or another transient failure, the next call
 * for that function waits (exponential backoff, honouring Retry-After) and
 * stops at a hard cap instead of filling the network.
 */

export const SERVER_FN_ATTEMPT_CAP = 4;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

type Slot = { failures: number; openUntil: number };

export function serverFnRequestKey(url: string): string | null {
  const match = String(url || "").match(/\/_serverFn\/[^?#]*/);
  return match ? match[0] : null;
}

export function isTransientServerFnStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Delay before the next try. `failures` is the count after this failure. */
export function serverFnBackoffMs(failures: number, retryAfter: string | null): number {
  const header = Number(retryAfter);
  if (Number.isFinite(header) && header > 0) return Math.min(Math.round(header * 1000), 30_000);
  const exp = 400 * 2 ** Math.max(0, failures - 1);
  return Math.min(exp, 8_000);
}

export class ServerFnCircuit {
  #slots = new Map<string, Slot>();
  #now = () => Date.now();

  constructor(now?: () => number) {
    if (now) this.#now = now;
  }

  /** True when this function is over the cap and the window has not elapsed. */
  blocked(key: string): boolean {
    const slot = this.#slots.get(key);
    if (!slot) return false;
    if (slot.failures < SERVER_FN_ATTEMPT_CAP) return false;
    if (this.#now() >= slot.openUntil) {
      slot.failures = 0;
      return false;
    }
    return true;
  }

  waitMs(key: string): number {
    const slot = this.#slots.get(key);
    if (!slot || slot.failures === 0 || slot.failures >= SERVER_FN_ATTEMPT_CAP) return 0;
    return Math.max(0, slot.openUntil - this.#now());
  }

  recordSuccess(key: string) {
    this.#slots.delete(key);
  }

  recordFailure(key: string, status: number, retryAfter: string | null) {
    if (!isTransientServerFnStatus(status)) {
      this.recordSuccess(key);
      return;
    }
    const failures = (this.#slots.get(key)?.failures ?? 0) + 1;
    this.#slots.set(key, {
      failures,
      openUntil: this.#now() + serverFnBackoffMs(failures, retryAfter),
    });
  }
}

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestSignal(input: FetchInput, init?: FetchInit): AbortSignal | undefined {
  if (init?.signal !== undefined) return init.signal ?? undefined;
  return input instanceof Request ? input.signal : undefined;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

/** No transport is running during backoff, so cancellation can release it now. */
function waitForRetry(
  ms: number,
  signal?: AbortSignal,
  sleep?: (ms: number) => Promise<void>,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: unknown, failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (failed) reject(error);
      else resolve();
    };
    const onAbort = () => finish(signal ? abortReason(signal) : undefined, true);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (sleep) void Promise.resolve().then(() => sleep(ms)).then(() => finish(), (error: unknown) => finish(error, true));
    else timer = setTimeout(() => finish(), ms);
  });
}

/** Race a wait with cancellation, removing its listener on every settle path. */
function waitWithSignal<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) {
    void pending.catch(() => undefined);
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export function createServerFnFetch(options: {
  fetchImpl: (input: FetchInput, init?: FetchInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): (input: FetchInput, init?: FetchInit) => Promise<Response> {
  const now = options.now ?? (() => Date.now());
  const circuit = new ServerFnCircuit(now);
  const tails = new Map<string, Promise<unknown>>();

  return (input, init) => {
    const key = serverFnRequestKey(requestUrl(input));
    if (!key) return options.fetchImpl(input, init);
    const signal = requestSignal(input, init);
    const requestInit = signal ? { ...init, signal } : init;
    const prev = tails.get(key) ?? Promise.resolve();
    const before = prev.catch(() => undefined);
    const run = waitWithSignal(before, signal).then(async () => {
      signal?.throwIfAborted();
      if (circuit.blocked(key)) throw new Error("Too many requests");
      let response: Response | null = null;
      for (let attempt = 1; attempt <= SERVER_FN_ATTEMPT_CAP; attempt += 1) {
        checkCancelled(signal);
        if (circuit.blocked(key)) throw new Error("Too many requests");
        const wait = circuit.waitMs(key);
        if (wait > 0) await waitForRetry(wait, signal, options.sleep);
        signal?.throwIfAborted();
        try {
          response = await waitWithSignal(options.fetchImpl(input, requestInit), signal);
          signal?.throwIfAborted();
        } catch (error) {
          // Abandoning a read is not a service failure and must not be retried.
          if (signal?.aborted) throw signal.reason ?? error;
          circuit.recordFailure(key, 503, null);
          if (attempt === SERVER_FN_ATTEMPT_CAP) throw error;
          continue;
        }
        if (!isTransientServerFnStatus(response.status)) {
          circuit.recordSuccess(key);
          return response;
        }
        circuit.recordFailure(key, response.status, response.headers.get("retry-after"));
        if (attempt === SERVER_FN_ATTEMPT_CAP) return response;
      }
      return response as Response;
    });
    const settled = run.then(() => undefined, () => undefined);
    // A cancelled queued read rejects promptly, while its predecessor still
    // owns the queue until it settles. Cancelling an active read frees its slot.
    tails.set(key, before.then(() => settled));
    return run;
  };
}

let installed = false;

/** Browser only. Server renders do not share this fetch. */
export function installServerFnFetchGate() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = createServerFnFetch({ fetchImpl: original }) as typeof window.fetch;
}
