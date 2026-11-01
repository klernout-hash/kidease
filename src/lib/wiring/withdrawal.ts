/**
 * Withdrawal: the centre's notice period, a final invoice from the stored
 * fee, then a freed space and an area-waitlist match. FEATURE_WITHDRAWAL
 * defaults off. No fee is invented.
 */

import { wiringEnabled, wiringMode } from "./common.ts";

export const WITHDRAWAL_FLAG = "FEATURE_WITHDRAWAL";

export function withdrawalEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(WITHDRAWAL_FLAG, env);
}

export function withdrawalMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(WITHDRAWAL_FLAG, env, dry);
}

function ymd(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

export function planWithdrawal(input: {
  noticeDays: number | null;
  requestedOn: string;
  lastDay: string;
  feeCents: number | null;
  spotsTracked: boolean;
}):
  | { ok: true; lastDay: string; invoiceCents: number | null; freeSpace: boolean; alertWaitlist: boolean }
  | { ok: false; error: "notice_missing" | "notice" | "date" } {
  if (input.noticeDays == null || !Number.isInteger(input.noticeDays) || input.noticeDays < 1 || input.noticeDays > 90) {
    return { ok: false, error: "notice_missing" };
  }
  const requested = ymd(input.requestedOn);
  const last = ymd(input.lastDay);
  if (requested == null || last == null) return { ok: false, error: "date" };
  const earliest = requested + input.noticeDays * 24 * 60 * 60 * 1000;
  if (last < earliest) return { ok: false, error: "notice" };
  const invoiceCents =
    input.feeCents != null && Number.isInteger(input.feeCents) && input.feeCents >= 0 && input.feeCents <= 2_000_000
      ? input.feeCents
      : null;
  const freeSpace = input.spotsTracked === true;
  return { ok: true, lastDay: input.lastDay, invoiceCents, freeSpace, alertWaitlist: freeSpace };
}
