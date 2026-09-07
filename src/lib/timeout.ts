/** Shared settle/reject timers so boot, auth, and ranking cannot hang forever. */

export const BOOT_SETTLE_MS = 8000;
export const SESSION_SETTLE_MS = 8000;
export const SQL_SETTLE_MS = 6000;
export const LOADER_SETTLE_MS = 6000;

export function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export function resolveAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, rejectAfter(ms, message)]);
}

export function withTimeoutFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, rejectAfter(ms, "timeout")])
    .catch(() => fallback);
}
