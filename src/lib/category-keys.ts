/** Shared search keys. French labels and English slugs mean the same filter. */

const BEFORE_AFTER = new Set([
  "before-after",
  "before_after",
  "before & after",
  "avant et apres",
  "avant et après",
  "avant-et-apres",
  "avant-apres",
]);

export function canonicalExploreCategory(value: unknown): "before-after" | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  const plain = raw.normalize("NFD").replace(/\p{M}/gu, "");
  if (BEFORE_AFTER.has(raw) || BEFORE_AFTER.has(plain)) return "before-after";
  return undefined;
}

export function scheduleFromStoredFees(input: {
  stored: readonly string[];
  schedule: "full" | "part" | "flexible";
  partTimeMonthly?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
}): boolean {
  if (input.stored.length) return input.stored.includes(input.schedule);
  const fee = (value: number | null | undefined) => typeof value === "number" && value > 0;
  if (input.schedule === "part") return fee(input.partTimeMonthly);
  if (input.schedule === "full") return fee(input.infantMonthly) || fee(input.toddlerMonthly) || fee(input.preschoolMonthly);
  return false;
}
