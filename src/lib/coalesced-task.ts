/**
 * Run one read at a time. Requests made while it runs collapse into one more
 * read of the latest state, so a slow connection never builds a camera backlog.
 */
export function createCoalescedTask(task: () => Promise<void>) {
  let running = false;
  let queued = false;
  let disposed = false;

  async function drain() {
    while (!disposed && queued) {
      queued = false;
      try {
        await task();
      } catch {
        // A failed read can be requested again by the next camera change.
      }
    }
    running = false;
  }

  return {
    run() {
      if (disposed) return;
      queued = true;
      if (running) return;
      running = true;
      void drain();
    },
    dispose() {
      disposed = true;
      queued = false;
    },
  };
}
