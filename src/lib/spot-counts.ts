/** Open-spot and fee inputs. Blank or non-numeric values must not reach integer columns. */
export function nonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}
