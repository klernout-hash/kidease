import { LOADER_SETTLE_MS } from "./timeout.ts";

export type ClaimLookupState<T> = {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  hits: T[];
};

/** A lookup may fail or finish empty. Only a successful empty read means no match. */
export function startClaimLookup<T>(
  query: string,
  search: (query: string) => Promise<T[]>,
  update: (state: ClaimLookupState<T>) => void,
  { debounceMs = 180, timeoutMs = LOADER_SETTLE_MS } = {},
): () => void {
  const term = query.trim();
  if (term.length < 2) {
    update({ query: term, status: "idle", hits: [] });
    return () => {};
  }

  let live = true;
  let settled = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  update({ query: term, status: "loading", hits: [] });
  const finish = (status: "ready" | "error", hits: T[] = []) => {
    if (!live || settled) return;
    settled = true;
    clearTimeout(deadline);
    update({ query: term, status, hits });
  };
  const debounce = setTimeout(() => {
    deadline = setTimeout(() => finish("error"), timeoutMs);
    void Promise.resolve()
      .then(() => search(term))
      .then((hits) => finish("ready", hits), () => finish("error"));
  }, debounceMs);

  return () => {
    live = false;
    clearTimeout(debounce);
    clearTimeout(deadline);
  };
}
