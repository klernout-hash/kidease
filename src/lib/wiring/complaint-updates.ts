/**
 * Government complaint updates for the parent who filed.
 * Uses gov_complaints when that table exists, otherwise safety_reports.
 * FEATURE_COMPLAINT_UPDATES defaults off.
 */

import { clipText, governmentSeesProvince, wiringEnabled, wiringMode } from "./common.ts";

export const COMPLAINT_UPDATE_FLAG = "FEATURE_COMPLAINT_UPDATES";
export const COMPLAINT_SOURCES = ["gov_complaints", "safety_reports"] as const;
export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number];

export function complaintUpdatesEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(COMPLAINT_UPDATE_FLAG, env);
}

export function complaintUpdatesMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(COMPLAINT_UPDATE_FLAG, env, dry);
}

export function pickComplaintSource(govTable: boolean): ComplaintSource {
  return govTable ? "gov_complaints" : "safety_reports";
}

export function complaintUpdate(input: {
  note: unknown;
  actorProvince: string;
  recordProvince: string;
  parentUserId: string | null;
}): { ok: true; note: string; parentUserId: string } | { ok: false; error: "province" | "note" | "parent" } {
  if (!governmentSeesProvince({ actorProvince: input.actorProvince, recordProvince: input.recordProvince })) {
    return { ok: false, error: "province" };
  }
  const note = clipText(input.note, 500);
  if (note.length < 2) return { ok: false, error: "note" };
  if (!input.parentUserId) return { ok: false, error: "parent" };
  return { ok: true, note, parentUserId: input.parentUserId };
}
