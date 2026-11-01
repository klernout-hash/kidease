/**
 * Claim approve / decline notices for the daycare and that province's
 * government desk. FEATURE_CLAIM_NOTICES defaults off.
 */

import { governmentSeesProvince, wiringEnabled, wiringMode } from "./common.ts";

export const CLAIM_NOTICE_FLAG = "FEATURE_CLAIM_NOTICES";

export function claimNoticesEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(CLAIM_NOTICE_FLAG, env);
}

export function claimNoticesMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(CLAIM_NOTICE_FLAG, env, dry);
}

export function claimNoticePlan(decision: string): { notify: boolean; decision: "approved" | "declined" } | { notify: false } {
  if (decision === "approve" || decision === "approved") return { notify: true, decision: "approved" };
  if (decision === "decline" || decision === "declined") return { notify: true, decision: "declined" };
  return { notify: false };
}

export function claimGovMaySee(actorProvince: string, recordProvince: string): boolean {
  return governmentSeesProvince({ actorProvince, recordProvince });
}
