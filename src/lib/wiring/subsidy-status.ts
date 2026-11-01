/**
 * Subsidy status the parent can read. Government or the daycare updates it.
 * KidEase does not decide the subsidy. FEATURE_SUBSIDY_STATUS defaults off.
 */

import { governmentSeesProvince, wiringEnabled, wiringMode } from "./common.ts";

export const SUBSIDY_FLAG = "FEATURE_SUBSIDY_STATUS";
export const SUBSIDY_STATUSES = ["submitted", "in_review", "approved", "declined"] as const;
export type SubsidyStatus = (typeof SUBSIDY_STATUSES)[number];

export function subsidyStatusEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(SUBSIDY_FLAG, env);
}

export function subsidyStatusMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(SUBSIDY_FLAG, env, dry);
}

export function nextSubsidyStatus(input: {
  from: SubsidyStatus | null;
  to: string;
  actor: "parent" | "provider" | "government";
  actorProvince?: string | null;
  recordProvince?: string | null;
}): { ok: true; status: SubsidyStatus } | { ok: false; error: "status" | "role" | "province" | "order" } {
  if (!(SUBSIDY_STATUSES as readonly string[]).includes(input.to)) return { ok: false, error: "status" };
  const to = input.to as SubsidyStatus;
  if (input.actor === "parent") {
    if (to !== "submitted" || input.from) return { ok: false, error: "role" };
    return { ok: true, status: "submitted" };
  }
  if (input.actor === "government") {
    if (!governmentSeesProvince({ actorProvince: input.actorProvince, recordProvince: input.recordProvince })) {
      return { ok: false, error: "province" };
    }
  }
  if (!input.from) return { ok: false, error: "order" };
  if (input.from === "approved" || input.from === "declined") return { ok: false, error: "order" };
  return { ok: true, status: to };
}
