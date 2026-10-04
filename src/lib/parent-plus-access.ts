/**
 * Parent Plus tools while paid plans are switched off.
 * Signed-in parents get the Plus tools. Checkout stays compiled and off.
 * Parent Alerts (SMS and push) stay a separate plan and stay behind their channel flags.
 */

export const PARENT_FREE_COMPARE_MAX = 5;
export const PARENT_PLUS_COMPARE_MAX = 10;

export function parentPlusFeaturesOpen(input: {
  subscriptionsOn: boolean;
  role?: string | null;
  paid?: boolean;
}): boolean {
  const role = String(input.role || "")
    .trim()
    .toLowerCase();
  if (!input.subscriptionsOn) return role === "parent";
  if (role !== "parent" && role !== "admin") return false;
  return Boolean(input.paid);
}

export function parentCompareMax(input: {
  subscriptionsOn: boolean;
  role?: string | null;
  paid?: boolean;
}): number {
  return parentPlusFeaturesOpen(input) ? PARENT_PLUS_COMPARE_MAX : PARENT_FREE_COMPARE_MAX;
}

/** Parent upgrade and Parent Plus checkout chrome. Hidden while subscriptions are off. */
export function showParentUpgradeCta(subscriptionsOn: boolean): boolean {
  return subscriptionsOn;
}
