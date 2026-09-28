/**
 * When a paid plan may be mentioned.
 * The public plans page stays available. Home cards and cap notes wait
 * until the free product has been used.
 */

export type PlansAudience = "parent" | "daycare" | "both";

export type HomeUpgradeCard = "plan" | "upgrade" | null;

export type DaycareCapPrompt = "near" | "at" | null;

/** Guests and admin see both catalogues. A parent or daycare sees only their side. */
export function plansAudience(role: string | null | undefined): PlansAudience {
  if (role === "parent") return "parent";
  if (role === "provider") return "daycare";
  return "both";
}

/**
 * Free centres get a small note at 8 of 10 (two left) and when the cap is hit.
 * Paid plans have no cap, so they never see it.
 */
export function daycareCapPrompt(used: number, cap: number | null | undefined): DaycareCapPrompt {
  if (cap == null || cap <= 0) return null;
  const n = Math.max(0, Math.floor(used));
  if (n >= cap) return "at";
  if (n >= cap - 2) return "near";
  return null;
}

/** A request, tour, lead, or message to a centre. Saving a listing does not count. */
export function parentHomeCardEligible(input: { requests?: number; messages?: number }): boolean {
  return (input.requests ?? 0) > 0 || (input.messages ?? 0) > 0;
}

/** Claimed listing, or a listing that has fees, ages, hours, licence, and a photo. */
export function daycareHomeCardEligible(input: { claimed?: boolean; listingReady?: boolean }): boolean {
  return Boolean(input.claimed || input.listingReady);
}

/**
 * Paid accounts always keep My plan. The free pitch waits for a real action
 * and stays hidden after the person dismisses it.
 */
export function showHomeUpgradeCard(input: {
  paid: boolean;
  eligible: boolean;
  dismissed: boolean;
}): HomeUpgradeCard {
  if (input.paid) return "plan";
  if (input.eligible && !input.dismissed) return "upgrade";
  return null;
}
