type ProviderDeskBatch<T> = {
  core: () => Promise<T>;
  feeds: ReadonlyArray<() => Promise<unknown>>;
  current: () => boolean;
  applyCore: (value: T) => void;
  onCoreFailed: (error: unknown) => void;
  onCoreSettled: () => void;
};

/** Core owns the loading/error state. Secondary lists never hold it open. */
export async function loadProviderDeskBatch<T>(batch: ProviderDeskBatch<T>): Promise<void> {
  for (const feed of batch.feeds) {
    // Start after scheduling the core read; fail independently of the desk.
    void Promise.resolve().then(feed).catch(() => undefined);
  }
  try {
    const value = await batch.core();
    if (batch.current()) batch.applyCore(value);
  } catch (error) {
    if (batch.current()) batch.onCoreFailed(error);
  } finally {
    if (batch.current()) batch.onCoreSettled();
  }
}
