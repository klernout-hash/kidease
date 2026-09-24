/** Shared settle/reject timers so boot, auth, and ranking cannot hang forever. */

export const BOOT_SETTLE_MS = 8000;
export const SESSION_SETTLE_MS = 8000;
export const SQL_SETTLE_MS = 6000;
export const LOADER_SETTLE_MS = 6000;
/**
 * SSR must flush the shell before catalogue / SQL settle. A warm query still
 * lands in the document; a slow one does not hold the white screen.
 */
export const PAINT_BUDGET_MS = 450;
/**
 * Home `/` only. A warm catalogue still lands in the first HTML. A slow query
 * must not hold the hero — the live chips stay blank until the real count arrives.
 */
export const HOME_PAINT_BUDGET_MS = 200;
/** Header geo is sync in practice. Cap it so a stuck server fn cannot blank the document. */
export const ORIGIN_BUDGET_MS = 300;

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
  return Promise.race([promise, rejectAfter(ms, "timeout")]).catch(() => fallback);
}

/**
 * Resolve when `promise` settles, or `{ ready: false }` when the paint budget
 * expires. The underlying work is not cancelled — callers must not await it
 * past this budget if it sits on the SSR critical path.
 */
export function withPaintBudget<T>(
  promise: Promise<T>,
  ms = PAINT_BUDGET_MS,
): Promise<{ value: T | null; ready: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: null, ready: false });
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value, ready: true });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value: null, ready: true });
      },
    );
  });
}
