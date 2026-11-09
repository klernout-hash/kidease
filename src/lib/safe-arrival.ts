/**
 * Safe arrival: absent without notice, or still here after pickup.
 * Consent is required. Only today, at or after the alert cutoff, can be recorded.
 * This module does not send email, SMS, or push.
 */

import { alertIsProspective } from "./customer-alert-policy.ts";

export type SafeArrivalKind = "absent_without_notice" | "late_pickup";

export function clockToMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function classifySafeArrival(input: {
  nowMinutes: number;
  dropOff: string | null;
  pickUp: string | null;
  checkedIn: boolean;
  checkedOut: boolean;
  parentNotified: boolean;
}): SafeArrivalKind | null {
  const drop = clockToMinutes(input.dropOff);
  const pick = clockToMinutes(input.pickUp);
  if (
    drop != null &&
    !input.checkedIn &&
    !input.parentNotified &&
    input.nowMinutes > drop + 15 &&
    input.nowMinutes < drop + 180
  ) {
    return "absent_without_notice";
  }
  if (
    pick != null &&
    input.checkedIn &&
    !input.checkedOut &&
    input.nowMinutes > pick + 15 &&
    input.nowMinutes < pick + 180
  ) {
    return "late_pickup";
  }
  return null;
}

/** Today only, and only after the customer-alert cutoff. Older days are not replayed. */
export function safeArrivalDayAllowed(day: string, now = new Date()): boolean {
  if (!alertIsProspective(now)) return false;
  const today = now.toISOString().slice(0, 10);
  return day === today;
}

export function safeArrivalGate(input: { consent: boolean; day: string; now?: Date }): {
  record: boolean;
  reason: "ok" | "consent" | "past";
} {
  if (!input.consent) return { record: false, reason: "consent" };
  if (!safeArrivalDayAllowed(input.day, input.now)) return { record: false, reason: "past" };
  return { record: true, reason: "ok" };
}

/** Sending stays off until Kyle previews a test to his QA accounts. */
export function safeArrivalSend(): "off" {
  return "off";
}
