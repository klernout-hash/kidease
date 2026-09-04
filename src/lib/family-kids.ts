export const MAX_KIDS = 4;

export const CHILD_LIMIT_MESSAGE = "This parent account can hold 4 child profiles.";

export function childSlotsUsed(count: number) {
  const used = Math.max(0, count);
  return {
    used,
    remaining: Math.max(0, MAX_KIDS - used),
    full: used >= MAX_KIDS,
    label: `${Math.min(used, MAX_KIDS)} of ${MAX_KIDS} profiles`,
  };
}
