/**
 * Turn saved facts into alert candidates. No database.
 * scripts/unified-alerts.test.mjs loads this file in Node.
 * A missing fact never becomes an alert.
 */

import {
  publicCentreName,
  safeUnifiedHref,
  type UnifiedCandidate,
} from "./unified-alerts.ts";

export type ScanFacts = {
  now: Date;
  spots?: Array<{ daycareId: string; name: string; spots: number; updatedAt: string; userIds: string[] }>;
  requests?: Array<{
    id: string;
    daycareId: string;
    name: string;
    userId: string;
    status: string;
    kind: string;
    updatedAt: string;
    createdAt: string;
    replyNote?: string | null;
    ownerUserIds: string[];
    source: "lead" | "tour" | "booking";
  }>;
  tours?: Array<{ id: string; userId: string; daycareId: string; name: string; startAt: string }>;
  waitlist?: Array<{ id: string; userId: string; daycareId: string; name: string; rank: number | null; status: string }>;
  messages?: Array<{
    id: string;
    daycareId: string;
    name: string;
    sender: "parent" | "provider";
    parentUserId: string;
    ownerUserIds: string[];
  }>;
  documents?: Array<{ id: string; userId: string; kind: "immunization" | "allergy"; expiresOn: string }>;
  licences?: Array<{ id: string; daycareId: string; name: string; ownerUserIds: string[] }>;
  spotCheckins?: Array<{ daycareId: string; name: string; ownerUserIds: string[]; checkedThisWeek: boolean }>;
  reviews?: Array<{ id: string; daycareId: string; name: string; ownerUserIds: string[] }>;
  left?: Array<{ id: string; daycareId: string; name: string; ownerUserIds: string[]; kind: "waitlist" | "tour" }>;
  shifts?: Array<{
    id: string;
    daycareId: string;
    name: string;
    staffUserId: string | null;
    startsAt: string;
    endsAt: string;
    createdAt: string;
  }>;
  ratios?: Array<{
    id: string;
    daycareId: string;
    name: string;
    children: number;
    staff: number;
    childrenPer: number;
    staffPer: number;
    staffUserIds: string[];
  }>;
  attendance?: Array<{
    id: string;
    daycareId: string;
    name: string;
    dropOff: string | null;
    pickUp: string | null;
    checkedIn: boolean;
    checkedOut: boolean;
    staffUserIds: string[];
    timeZone: string;
  }>;
  pickups?: Array<{ id: string; daycareId: string; name: string; listed: boolean; known: boolean; staffUserIds: string[] }>;
  meds?: Array<{ id: string; daycareId: string; name: string; time: string; logged: boolean; staffUserIds: string[]; timeZone: string }>;
  certs?: Array<{ id: string; daycareId: string; name: string; expiresOn: string; userIds: string[] }>;
  safetyChecks?: Array<{ daycareId: string; name: string; lastAt: string | null; ever: boolean; ownerUserIds: string[] }>;
  incidents?: Array<{ id: string; daycareId: string; name: string; open: boolean; staffUserIds: string[] }>;
  notes?: Array<{ id: string; daycareId: string; name: string; staffUserIds: string[] }>;
  children?: Array<{ id: string; daycareId: string; name: string; startMonth: string; staffUserIds: string[] }>;
  signups?: Array<{ id: string; createdAt: string }>;
  signupAdmins?: string[];
  safetyReports?: Array<{ id: string; userId: string; href: string }>;
  safetyBlocks?: Array<{ id: string; userId: string; href: string }>;
};

function centre(name: string): string {
  return publicCentreName(name, "en");
}

function row(partial: UnifiedCandidate): UnifiedCandidate {
  return { ...partial, href: safeUnifiedHref(partial.href), name: centre(partial.name) };
}

function hoursBetween(later: Date, earlierIso: string): number | null {
  const then = Date.parse(earlierIso);
  if (!Number.isFinite(then)) return null;
  return (later.getTime() - then) / 36e5;
}

function withinHours(now: Date, iso: string, minHours: number, maxHours: number): boolean {
  const delta = hoursBetween(new Date(iso), now.toISOString());
  if (delta == null) return false;
  return delta >= minHours && delta <= maxHours;
}

export function ratioPressure(
  children: number,
  staffCount: number,
  childrenPer: number,
  staffPer: number,
): "ok" | "near" | "over" {
  if (children <= 0 || childrenPer <= 0 || staffPer <= 0) return "ok";
  if (staffCount <= 0) return "over";
  const allowed = (staffCount / staffPer) * childrenPer;
  if (children > allowed) return "over";
  if (children >= allowed * 0.85) return "near";
  return "ok";
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function clockToMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function zonedMinutes(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const num = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
    const hour = num("hour") === 24 ? 0 : num("hour");
    return hour * 60 + num("minute");
  } catch {
    return null;
  }
}

function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function dateOnly(iso: string): string {
  return String(iso || "").slice(0, 10);
}

function expiryDue(expiresOn: string, now: Date): boolean {
  const day = dateOnly(expiresOn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const exp = Date.parse(`${day}T18:00:00Z`);
  if (!Number.isFinite(exp)) return false;
  const start = now.getTime() - 7 * 864e5;
  const end = now.getTime() + 60 * 864e5;
  return exp >= start && exp <= end;
}

export function planUnifiedScan(facts: ScanFacts): UnifiedCandidate[] {
  const out: UnifiedCandidate[] = [];
  const now = facts.now;
  const day = dayKey(now);

  for (const spot of facts.spots || []) {
    if (spot.spots <= 0) continue;
    const age = hoursBetween(now, spot.updatedAt);
    if (age == null || age < 0 || age > 24 * 14) continue;
    for (const userId of spot.userIds) {
      if (!userId) continue;
      out.push(
        row({
          typeId: "parent_spot_opened",
          userId,
          dedupeKey: `parent_spot_opened:${spot.daycareId}:${day}`,
          name: spot.name,
          status: String(spot.spots),
          href: "/parent?tab=saved",
          daycareId: spot.daycareId,
        }),
      );
    }
  }

  for (const request of facts.requests || []) {
    const accepted = request.status === "confirmed" || request.status === "accepted";
    const declined = request.status === "declined";
    const note = (request.replyNote || "").trim();
    const needsInfo = !accepted && !declined && note.length > 0 && (request.status === "answered" || request.status === "received");
    const typeId = accepted ? "parent_request_accepted" : declined ? "parent_request_declined" : needsInfo ? "parent_request_needs_info" : "";
    if (typeId && request.userId) {
      out.push(
        row({
          typeId,
          userId: request.userId,
          dedupeKey: `${typeId}:${request.source}:${request.id}`,
          name: request.name,
          status: request.status,
          href: "/parent?tab=enrolled",
          daycareId: request.daycareId,
        }),
      );
    }
    const freshHours = hoursBetween(now, request.createdAt);
    const waiting = request.status === "requested" || request.status === "pending";
    if (waiting && freshHours != null && freshHours >= 24 && freshHours <= 24 * 7) {
      for (const userId of request.ownerUserIds) {
        out.push(
          row({
            typeId: "daycare_request_unanswered",
            userId,
            dedupeKey: `daycare_request_unanswered:${request.id}:${day}`,
            name: request.name,
            status: request.kind,
            href: "/provider",
            daycareId: request.daycareId,
            counterpartyUserId: request.userId,
          }),
        );
      }
    }
    const createdHours = hoursBetween(now, request.createdAt);
    if ((request.status === "requested" || request.status === "pending") && createdHours != null && createdHours >= 0 && createdHours <= 24) {
      for (const userId of request.ownerUserIds) {
        out.push(
          row({
            typeId: "daycare_new_request",
            userId,
            dedupeKey: `daycare_new_request:${request.id}`,
            name: request.name,
            status: request.kind,
            href: "/provider",
            daycareId: request.daycareId,
            counterpartyUserId: request.userId,
          }),
        );
      }
    }
  }

  for (const tour of facts.tours || []) {
    if (withinHours(now, tour.startAt, 23, 25)) {
      out.push(
        row({
          typeId: "parent_tour_day",
          userId: tour.userId,
          dedupeKey: `parent_tour_day:${tour.id}:${day}`,
          name: tour.name,
          status: "tomorrow",
          href: "/parent?tab=enrolled",
          daycareId: tour.daycareId,
        }),
      );
    }
    if (withinHours(now, tour.startAt, 0.75, 1.25)) {
      out.push(
        row({
          typeId: "parent_tour_hour",
          userId: tour.userId,
          dedupeKey: `parent_tour_hour:${tour.id}`,
          name: tour.name,
          status: "soon",
          href: "/parent?tab=enrolled",
          daycareId: tour.daycareId,
        }),
      );
    }
  }

  for (const item of facts.waitlist || []) {
    if (!item.userId) continue;
    if (item.status === "withdrawn") continue;
    const place = item.rank != null && item.rank > 0 ? String(item.rank) : item.status;
    if (!place) continue;
    out.push(
      row({
        typeId: "parent_waitlist_position",
        userId: item.userId,
        dedupeKey: `parent_waitlist_position:${item.id}:${place}`,
        name: item.name,
        status: place,
        href: "/parent?tab=enrolled",
        daycareId: item.daycareId,
      }),
    );
  }

  for (const message of facts.messages || []) {
    if (message.sender === "provider" && message.parentUserId) {
      out.push(
        row({
          typeId: "parent_new_message",
          userId: message.parentUserId,
          dedupeKey: `parent_new_message:${message.id}`,
          name: message.name,
          status: "",
          href: "/inbox",
          daycareId: message.daycareId,
        }),
      );
    }
    if (message.sender === "parent") {
      for (const userId of message.ownerUserIds) {
        out.push(
          row({
            typeId: "daycare_new_message",
            userId,
            dedupeKey: `daycare_new_message:${message.id}`,
            name: message.name,
            status: "",
            href: "/inbox",
            daycareId: message.daycareId,
            counterpartyUserId: message.parentUserId,
          }),
        );
      }
    }
  }

  for (const doc of facts.documents || []) {
    if (!expiryDue(doc.expiresOn, now) || !doc.userId) continue;
    const typeId = doc.kind === "immunization" ? "parent_immunization_expiring" : "parent_allergy_plan_expiring";
    out.push(
      row({
        typeId,
        userId: doc.userId,
        dedupeKey: `${typeId}:${doc.id}:${dateOnly(doc.expiresOn)}`,
        name: "",
        status: dateOnly(doc.expiresOn),
        href: "/parent",
      }),
    );
  }

  for (const licence of facts.licences || []) {
    for (const userId of licence.ownerUserIds) {
      out.push(
        row({
          typeId: "daycare_licence_expiring",
          userId,
          dedupeKey: `daycare_licence_expiring:${licence.id}:${day.slice(0, 7)}`,
          name: licence.name,
          status: "",
          href: "/provider",
          daycareId: licence.daycareId,
        }),
      );
    }
  }

  for (const check of facts.spotCheckins || []) {
    if (check.checkedThisWeek) continue;
    for (const userId of check.ownerUserIds) {
      out.push(
        row({
          typeId: "daycare_weekly_spots",
          userId,
          dedupeKey: `daycare_weekly_spots:${check.daycareId}:${day.slice(0, 7)}`,
          name: check.name,
          status: "",
          href: "/provider",
          daycareId: check.daycareId,
        }),
      );
    }
  }

  for (const review of facts.reviews || []) {
    for (const userId of review.ownerUserIds) {
      out.push(
        row({
          typeId: "daycare_new_review",
          userId,
          dedupeKey: `daycare_new_review:${review.id}`,
          name: review.name,
          status: "",
          href: "/provider",
          daycareId: review.daycareId,
        }),
      );
    }
  }

  for (const left of facts.left || []) {
    for (const userId of left.ownerUserIds) {
      out.push(
        row({
          typeId: "daycare_family_left",
          userId,
          dedupeKey: `daycare_family_left:${left.kind}:${left.id}`,
          name: left.name,
          status: left.kind,
          href: "/provider",
          daycareId: left.daycareId,
        }),
      );
    }
  }

  for (const shift of facts.shifts || []) {
    if (!shift.staffUserId) continue;
    const start = Date.parse(shift.startsAt);
    const end = Date.parse(shift.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const untilStart = (start - now.getTime()) / 6e4;
    const untilEnd = (end - now.getTime()) / 6e4;
    if (untilStart >= 0 && untilStart <= 70) {
      out.push(
        row({
          typeId: "staff_shift_start",
          userId: shift.staffUserId,
          dedupeKey: `staff_shift_start:${shift.id}`,
          name: shift.name,
          status: "",
          href: "/provider",
          daycareId: shift.daycareId,
        }),
      );
    }
    if (untilEnd >= 0 && untilEnd <= 70) {
      out.push(
        row({
          typeId: "staff_shift_end",
          userId: shift.staffUserId,
          dedupeKey: `staff_shift_end:${shift.id}`,
          name: shift.name,
          status: "",
          href: "/provider",
          daycareId: shift.daycareId,
        }),
      );
    }
    const createdAge = hoursBetween(now, shift.createdAt);
    if (createdAge != null && createdAge >= 0 && createdAge <= 24 && untilStart > 70) {
      out.push(
        row({
          typeId: "staff_schedule_change",
          userId: shift.staffUserId,
          dedupeKey: `staff_schedule_change:${shift.id}`,
          name: shift.name,
          status: "",
          href: "/provider",
          daycareId: shift.daycareId,
        }),
      );
    }
  }

  for (const ratio of facts.ratios || []) {
    const pressure = ratioPressure(ratio.children, ratio.staff, ratio.childrenPer, ratio.staffPer);
    if (pressure === "ok") continue;
    for (const userId of ratio.staffUserIds) {
      out.push(
        row({
          typeId: "staff_ratio",
          userId,
          dedupeKey: `staff_ratio:${ratio.id}`,
          name: ratio.name,
          status: pressure,
          href: "/provider",
          daycareId: ratio.daycareId,
        }),
      );
    }
  }

  for (const sheet of facts.attendance || []) {
    const minute = zonedMinutes(now, sheet.timeZone || "America/Winnipeg");
    if (minute == null) continue;
    const drop = clockToMinutes(sheet.dropOff);
    if (drop != null && !sheet.checkedIn && minute > drop + 15 && minute < drop + 180) {
      for (const userId of sheet.staffUserIds) {
        out.push(
          row({
            typeId: "staff_child_not_arrived",
            userId,
            dedupeKey: `staff_child_not_arrived:${sheet.id}:${day}`,
            name: sheet.name,
            status: "",
            href: "/provider",
            daycareId: sheet.daycareId,
          }),
        );
      }
    }
    const pick = clockToMinutes(sheet.pickUp);
    if (pick != null && sheet.checkedIn && !sheet.checkedOut && minute > pick + 15 && minute < pick + 180) {
      for (const userId of sheet.staffUserIds) {
        out.push(
          row({
            typeId: "staff_child_still_here",
            userId,
            dedupeKey: `staff_child_still_here:${sheet.id}:${day}`,
            name: sheet.name,
            status: "",
            href: "/provider",
            daycareId: sheet.daycareId,
          }),
        );
      }
    }
  }

  for (const pickup of facts.pickups || []) {
    if (!pickup.listed || pickup.known) continue;
    for (const userId of pickup.staffUserIds) {
      out.push(
        row({
          typeId: "staff_pickup_new",
          userId,
          dedupeKey: `staff_pickup_new:${pickup.id}`,
          name: pickup.name,
          status: "",
          href: "/provider",
          daycareId: pickup.daycareId,
        }),
      );
    }
  }

  for (const med of facts.meds || []) {
    if (med.logged) continue;
    const due = clockToMinutes(med.time);
    const minute = zonedMinutes(now, med.timeZone || "America/Winnipeg");
    if (due == null || minute == null) continue;
    const delta = minute - due;
    if (delta < 0 || delta > 20) continue;
    for (const userId of med.staffUserIds) {
      out.push(
        row({
          typeId: "staff_medication_time",
          userId,
          dedupeKey: `staff_medication_time:${med.id}:${day}:${med.time}`,
          name: med.name,
          status: med.time,
          href: "/provider",
          daycareId: med.daycareId,
        }),
      );
    }
  }

  for (const cert of facts.certs || []) {
    if (!expiryDue(cert.expiresOn, now)) continue;
    for (const userId of cert.userIds) {
      out.push(
        row({
          typeId: "staff_cert_expiring",
          userId,
          dedupeKey: `staff_cert_expiring:${cert.id}:${dateOnly(cert.expiresOn)}`,
          name: cert.name,
          status: dateOnly(cert.expiresOn),
          href: "/provider",
          daycareId: cert.daycareId,
        }),
      );
    }
  }

  for (const check of facts.safetyChecks || []) {
    if (!check.ever || !check.lastAt) continue;
    const age = hoursBetween(now, check.lastAt);
    if (age == null || age < 24 * 30) continue;
    for (const userId of check.ownerUserIds) {
      out.push(
        row({
          typeId: "staff_safety_check",
          userId,
          dedupeKey: `staff_safety_check:${check.daycareId}:${day.slice(0, 7)}`,
          name: check.name,
          status: "",
          href: "/provider",
          daycareId: check.daycareId,
        }),
      );
    }
  }

  for (const incident of facts.incidents || []) {
    if (!incident.open) continue;
    for (const userId of incident.staffUserIds) {
      out.push(
        row({
          typeId: "staff_incident_open",
          userId,
          dedupeKey: `staff_incident_open:${incident.id}`,
          name: incident.name,
          status: "",
          href: "/provider",
          daycareId: incident.daycareId,
        }),
      );
    }
  }

  for (const note of facts.notes || []) {
    for (const userId of note.staffUserIds) {
      out.push(
        row({
          typeId: "staff_director_note",
          userId,
          dedupeKey: `staff_director_note:${note.id}:${day}`,
          name: note.name,
          status: "",
          href: "/inbox",
          daycareId: note.daycareId,
        }),
      );
    }
  }

  const month = monthKey(now);
  const firstWeek = Number(day.slice(8, 10)) <= 7;
  if (firstWeek) {
    for (const child of facts.children || []) {
      if (child.startMonth !== month) continue;
      for (const userId of child.staffUserIds) {
        out.push(
          row({
            typeId: "staff_new_child",
            userId,
            dedupeKey: `staff_new_child:${child.id}:${month}`,
            name: child.name,
            status: month,
            href: "/provider",
            daycareId: child.daycareId,
          }),
        );
      }
    }
  }

  const signupCount = (facts.signups || []).filter((signup) => {
    const age = hoursBetween(now, signup.createdAt);
    return age != null && age >= 0 && age <= 24;
  }).length;
  if (signupCount > 0) {
    for (const userId of facts.signupAdmins || []) {
      if (!userId) continue;
      out.push(
        row({
          typeId: "admin_daily_digest",
          userId,
          dedupeKey: `admin_daily_digest:${day}`,
          name: "KidEase",
          status: String(signupCount),
          href: "/admin",
        }),
      );
    }
  }

  for (const report of facts.safetyReports || []) {
    if (!report.userId) continue;
    out.push(
      row({
        typeId: "admin_safety_report",
        userId: report.userId,
        dedupeKey: `admin_safety_report:${report.id}:${report.userId}`,
        name: "KidEase",
        status: "",
        href: report.href || "/admin",
      }),
    );
  }

  for (const block of facts.safetyBlocks || []) {
    if (!block.userId) continue;
    out.push(
      row({
        typeId: "admin_safety_block",
        userId: block.userId,
        dedupeKey: `admin_safety_block:${block.id}`,
        name: "KidEase",
        status: "",
        href: block.href || "/admin",
      }),
    );
  }

  return out.filter((item) => item.userId);
}
