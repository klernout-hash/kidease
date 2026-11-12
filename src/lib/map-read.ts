export const MAP_READ_TIMEOUT_MS = 12_000;

/** Abort the transport itself; do not release the queue while fetch still runs. */
export async function withMapReadDeadline<T>(
  load: (signal: AbortSignal) => Promise<T>,
  lifetime: AbortSignal,
  timeoutMs = MAP_READ_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(lifetime.reason);
  if (lifetime.aborted) onAbort();
  else lifetime.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("Map read timed out", "TimeoutError")),
    timeoutMs,
  );
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    return await load(controller.signal);
  } finally {
    clearTimeout(timer);
    lifetime.removeEventListener("abort", onAbort);
  }
}

/** A closed map must not wait out a throttled request's retry delay. */
export function waitForMapRetry(ms: number, lifetime: AbortSignal): Promise<void> {
  if (lifetime.aborted) return Promise.reject(lifetime.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(lifetime.reason);
    };
    const timer = setTimeout(() => {
      lifetime.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    lifetime.addEventListener("abort", onAbort, { once: true });
  });
}
