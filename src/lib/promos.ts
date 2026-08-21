export type PromoPlanId = "week" | "month" | "quarter";

export const PROMO_PLANS: Array<{
  id: PromoPlanId;
  days: number;
  amount: number;
}> = [
  { id: "week", days: 7, amount: 49 },
  { id: "month", days: 30, amount: 149 },
  { id: "quarter", days: 90, amount: 399 },
];

export function promoPlan(id: string) {
  return PROMO_PLANS.find((p) => p.id === id) ?? null;
}

export function isPriorityActive(until?: string | null) {
  if (!until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > Date.now();
}
