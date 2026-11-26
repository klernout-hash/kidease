/**
 * Matched pairs for KidEase calls and video (Kyle, 2026-11-01).
 *
 * A parent and a centre may call or video each other only after the centre
 * accepted something for that family: a tour, a spot request (booking), an
 * enrolment hand-off, or an attendance link. A plain inquiry thread is not
 * enough. Admins (internal QA) skip the match.
 *
 * Pure: scripts/call-match.test.mjs loads this in Node.
 */

/** Spot requests / enrolments the centre accepted. Waitlist and under-review are not a match. */
export const CALL_MATCH_BOOKING_STATUSES = ["accepted", "active"] as const;

/** Tours the centre accepted, held, or turned into an enrolment. */
export const CALL_MATCH_TOUR_STATUSES = ["accepted", "completed", "enrolled"] as const;

export type CallMatchSignals = {
  bookingStatuses?: readonly (string | null | undefined)[];
  tourStatuses?: readonly (string | null | undefined)[];
  enrolmentHandoff?: boolean;
  attendanceLink?: boolean;
};

export type CallMatchReason = "booking" | "tour" | "enrolment" | "attendance";

function norm(v: string | null | undefined): string {
  return String(v || "")
    .trim()
    .toLowerCase();
}

/** Returns why the pair is matched, or null when calls stay locked. */
export function callMatchReason(signals: CallMatchSignals): CallMatchReason | null {
  const bookings = (signals.bookingStatuses ?? []).map(norm);
  if (bookings.some((s) => (CALL_MATCH_BOOKING_STATUSES as readonly string[]).includes(s))) return "booking";
  const tours = (signals.tourStatuses ?? []).map(norm);
  if (tours.some((s) => (CALL_MATCH_TOUR_STATUSES as readonly string[]).includes(s))) return "tour";
  if (signals.enrolmentHandoff) return "enrolment";
  if (signals.attendanceLink) return "attendance";
  return null;
}

export function callPairMatched(signals: CallMatchSignals): boolean {
  return callMatchReason(signals) !== null;
}

/** Machine code returned by call APIs when the pair is not matched. Never shown raw. */
export const CALL_NOT_MATCHED = "call_not_matched";

/**
 * Android store builds that ship without CAMERA / RECORD_AUDIO cannot answer a
 * WebView getUserMedia request. A build that declares them adds this token
 * (MainActivity reads its own manifest), so the site shows calls again.
 */
export const CALL_MEDIA_UA_TOKEN = "KidEaseCallMedia";

/**
 * True inside an Android store app (Play, Samsung, Huawei, Amazon) whose build
 * cannot use the camera or microphone yet. iOS, mobile web, and desktop are false.
 */
export function shellBlocksCallMedia(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || "");
  if (!ua.includes("KidEaseNative")) return false;
  if (!/Android/i.test(ua)) return false;
  return !ua.includes(CALL_MEDIA_UA_TOKEN);
}
