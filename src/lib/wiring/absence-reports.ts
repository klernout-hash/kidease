/**
 * A parent absence updates today's attendance and the room ratio in the
 * same request. Staff counts come from shifts on file. FEATURE_ABSENCE_REPORTS
 * defaults off.
 */

import { rosterRatio } from "../staff-scheduling.ts";
import type { RoomBand } from "../provincial-ratios.ts";
import { wiringEnabled, wiringMode } from "./common.ts";

export const ABSENCE_FLAG = "FEATURE_ABSENCE_REPORTS";

export function absenceReportsEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(ABSENCE_FLAG, env);
}

export function absenceReportsMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(ABSENCE_FLAG, env, dry);
}

export function applyAbsence(input: {
  alreadyAbsent: boolean;
  childrenPresent: number | null;
  staffOnShift: number | null;
  province: string;
  band: RoomBand;
}): {
  status: "absent";
  childrenNow: number | null;
  ratio: ReturnType<typeof rosterRatio> | null;
} {
  const known = input.childrenPresent != null && Number.isInteger(input.childrenPresent) && input.childrenPresent >= 0;
  const childrenNow = !known ? null : input.alreadyAbsent ? input.childrenPresent : Math.max(0, (input.childrenPresent ?? 0) - 1);
  const staffKnown = input.staffOnShift != null && Number.isInteger(input.staffOnShift) && input.staffOnShift >= 0;
  const ratio =
    childrenNow == null || !staffKnown
      ? null
      : rosterRatio({
          province: input.province,
          band: input.band,
          childrenPresent: childrenNow,
          staffOnShift: input.staffOnShift ?? 0,
        });
  return { status: "absent", childrenNow, ratio };
}
