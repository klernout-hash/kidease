import { useEffect, useState } from "react";

/** Admin desk test #34: render a long review queue in pages so ~290 cards do not mount at once. */
export const ADMIN_QUEUE_PAGE = 25;

export function pagedSlice<T>(rows: readonly T[], limit: number): { shown: T[]; more: number } {
  const n = Math.max(0, Math.floor(limit));
  return { shown: rows.slice(0, n), more: Math.max(0, rows.length - n) };
}

export function usePagedList<T>(rows: readonly T[], page = ADMIN_QUEUE_PAGE, resetKey?: unknown) {
  const [limit, setLimit] = useState(page);
  useEffect(() => {
    setLimit(page);
  }, [page, resetKey]);
  const { shown, more } = pagedSlice(rows, limit);
  return { shown, more, showMore: () => setLimit((n) => n + page) };
}
