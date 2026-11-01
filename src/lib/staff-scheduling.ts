/**
 * Staff shifts, ECE certificate reminders, and room ratios.
 * The centre types the child count. KidEase does not invent who is in the room.
 * Not payroll. No SMS.
 */

import { ratioRule, ratioStatus, type RatioStatus, type RoomBand } from "./provincial-ratios.ts";

export const SHIFT_ROLES = ["ece", "assistant", "other"] as const;
export type ShiftRole = (typeof SHIFT_ROLES)[number];

export const ROOM_BANDS = ["infant", "toddler", "preschool", "school-age"] as const;

export const ECE_REMIND_DAYS = 60;
export const ECE_REMIND_AGAIN_DAYS = 14;

export type ShiftInput = {
  staffName?: unknown;
  role?: unknown;
  roomBand?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
};

export type ParsedShift = {
  staffName: string;
  role: ShiftRole;
  roomBand: RoomBand;
  startsAt: string;
  endsAt: string;
  hours: number;
};

export function parseShift(input: ShiftInput): { ok: true; shift: ParsedShift } | { ok: false; error: "name" | "time" | "room" } {
  const staffName = String(input.staffName || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (staffName.length < 2) return { ok: false, error: "name" };
  const start = Date.parse(String(input.startsAt || ""));
  const end = Date.parse(String(input.endsAt || ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ok: false, error: "time" };
  const hours = Math.round(((end - start) / 3_600_000) * 10) / 10;
  if (hours <= 0 || hours > 16) return { ok: false, error: "time" };
  const role = SHIFT_ROLES.includes(input.role as ShiftRole) ? (input.role as ShiftRole) : "ece";
  const roomBand = ROOM_BANDS.includes(input.roomBand as RoomBand) ? (input.roomBand as RoomBand) : null;
  if (!roomBand) return { ok: false, error: "room" };
  return {
    ok: true,
    shift: {
      staffName,
      role,
      roomBand,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      hours,
    },
  };
}

export type EceCertInput = {
  id: string;
  staffName: string;
  expiresOn: string;
  remindedAt?: string | null;
};

/** Certificates inside 60 days, or already expired. Skip one reminded in the last 14 days. */
export function planEceReminders<T extends EceCertInput>(certs: readonly T[], now: Date): T[] {
  return certs.filter((cert) => {
    const day = String(cert.expiresOn || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const exp = Date.parse(`${day}T12:00:00Z`);
    if (!Number.isFinite(exp)) return false;
    const days = (exp - now.getTime()) / 86_400_000;
    if (days > ECE_REMIND_DAYS) return false;
    if (cert.remindedAt) {
      const reminded = Date.parse(cert.remindedAt);
      if (Number.isFinite(reminded) && now.getTime() - reminded < ECE_REMIND_AGAIN_DAYS * 86_400_000) return false;
    }
    return true;
  });
}

export function staffOnShift(
  shifts: readonly { roomBand: string; startsAt: string; endsAt: string }[],
  band: string,
  at: Date,
): number {
  const t = at.getTime();
  return shifts.filter((shift) => {
    if (shift.roomBand !== band) return false;
    const start = Date.parse(shift.startsAt);
    const end = Date.parse(shift.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= t && end > t;
  }).length;
}

export function rosterRatio(input: {
  province: string;
  band: RoomBand;
  childrenPresent: number;
  staffOnShift: number;
}): { staffToChildren: number; maxGroup: number; status: RatioStatus } {
  const kids = Math.max(0, Math.floor(input.childrenPresent));
  const staff = Math.max(0, Math.floor(input.staffOnShift));
  const rule = ratioRule(input.province, input.band);
  if (!rule || !rule.verified) {
    return { staffToChildren: 0, maxGroup: 0, status: "unknown" };
  }
  return {
    staffToChildren: rule.staffToChildren,
    maxGroup: rule.showMax ? rule.maxGroup : 0,
    status: ratioStatus(kids, staff, rule),
  };
}

export function parseChildrenPresent(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 80) return null;
  return n;
}
