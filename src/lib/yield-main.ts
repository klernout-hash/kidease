/**
 * Yield the main thread so a click/keypress can paint before heavy desk or
 * 2FA work. Prefers `scheduler.yield` when the browser has it.
 */
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof sched?.yield === "function") return sched.yield();
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
