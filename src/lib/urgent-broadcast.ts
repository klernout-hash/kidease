/**
 * Urgent care broadcast cap. At most 10 claimed centres, and only when
 * care is needed within 14 days. One send per signed-in parent per 7 days.
 */

export const URGENT_WINDOW_DAYS = 14;
export const BROADCAST_MAX = 10;
export const BROADCAST_COOLDOWN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BroadcastCentre = {
  id: string;
  claimed?: boolean;
  verified?: boolean;
  ageBands?: string[];
};

export type BroadcastPlan<T extends BroadcastCentre> = {
  allowed: boolean;
  reason: "ok" | "sign-in" | "window" | "cooldown" | "none";
  centres: T[];
  cap: number;
};

export function broadcastCooldownActive(lastBroadcastAt: string | null | undefined, now = new Date()): boolean {
  if (!lastBroadcastAt) return false;
  const then = Date.parse(lastBroadcastAt);
  if (!Number.isFinite(then)) return false;
  return now.getTime() - then < BROADCAST_COOLDOWN_DAYS * DAY_MS;
}

function ageOk(centre: BroadcastCentre, ageBand: string | null | undefined): boolean {
  if (!ageBand) return true;
  if (!centre.ageBands?.length) return true;
  return centre.ageBands.includes(ageBand);
}

export function planUrgentBroadcast<T extends BroadcastCentre>(
  centres: readonly T[],
  input: {
    neededWithinDays: number;
    signedIn: boolean;
    lastBroadcastAt?: string | null;
    ageBand?: string | null;
    now?: Date;
  },
): BroadcastPlan<T> {
  const cap = BROADCAST_MAX;
  if (!input.signedIn) return { allowed: false, reason: "sign-in", centres: [], cap };
  if (!Number.isFinite(input.neededWithinDays) || input.neededWithinDays < 0 || input.neededWithinDays > URGENT_WINDOW_DAYS) {
    return { allowed: false, reason: "window", centres: [], cap };
  }
  if (broadcastCooldownActive(input.lastBroadcastAt, input.now)) {
    return { allowed: false, reason: "cooldown", centres: [], cap };
  }
  const eligible = centres.filter((centre) => (centre.claimed === true || centre.verified === true) && ageOk(centre, input.ageBand));
  const picked = eligible.slice(0, cap);
  if (!picked.length) return { allowed: false, reason: "none", centres: [], cap };
  return { allowed: true, reason: "ok", centres: picked, cap };
}
