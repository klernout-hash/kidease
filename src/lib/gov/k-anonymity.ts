/**
 * Cells with fewer than K records are hidden.
 * A single hidden cell can be worked out from the total, so a neighbour
 * cell is hidden too until the hidden sum is at least K and at least two
 * cells are hidden.
 */

export const K_ANONYMITY = 5;

export function suppressCount(n: number, k = K_ANONYMITY): number | null {
  if (!Number.isFinite(n) || n < 0) return null;
  const whole = Math.floor(n);
  if (whole === 0) return 0;
  if (whole < k) return null;
  return whole;
}

export type CountRow = { n: number };

export type SuppressedRow<T> = T & { n: number | null; suppressed: boolean };

/**
 * Hide small groups. Does not rename them. Callers must drop the label
 * when `suppressed` is true if the label itself would identify the group.
 */
export function suppressRows<T extends CountRow>(rows: readonly T[], k = K_ANONYMITY): SuppressedRow<T>[] {
  const hidden = new Set<T>();
  const bySize = [...rows].sort((a, b) => a.n - b.n);
  for (const row of bySize) {
    if (row.n > 0 && row.n < k) hidden.add(row);
  }
  let hiddenSum = 0;
  for (const row of hidden) hiddenSum += row.n;
  if (hidden.size > 0 && (hidden.size < 2 || hiddenSum < k)) {
    for (const row of bySize) {
      if (hidden.has(row) || row.n <= 0) continue;
      hidden.add(row);
      hiddenSum += row.n;
      if (hidden.size >= 2 && hiddenSum >= k) break;
    }
  }
  return rows.map((row) =>
    hidden.has(row) ? { ...row, n: null, suppressed: true } : { ...row, n: row.n, suppressed: false },
  );
}

/** True when a published number would reveal a person, child, or small group. */
export function isSuppressedValue(n: number | null | undefined, k = K_ANONYMITY): boolean {
  if (n == null) return true;
  return n > 0 && n < k;
}
