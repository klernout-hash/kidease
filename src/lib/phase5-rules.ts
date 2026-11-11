/**
 * Phase 5. Flags default off. Nothing here sends mail, text, or a push, and nothing charges.
 */

export type AbsenceMark = { childId: string; from: string; to: string; reason: string };
export type RegisterRow = { childId: string; day: string; status: "expected" | "absent" | "here" };

function dayNumber(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

export function absenceDays(from: string, to: string): string[] {
  const start = dayNumber(from);
  const end = dayNumber(to || from);
  if (start == null || end == null || end < start) return [];
  const days: string[] = [];
  for (let time = start; time <= end && days.length < 31; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** Marks those days absent. Does not change any other child, and does not free the spot. */
export function applyAbsence(rows: readonly RegisterRow[], mark: AbsenceMark): RegisterRow[] {
  const days = new Set(absenceDays(mark.from, mark.to));
  if (!mark.childId || !days.size) return [...rows];
  const next = rows.map((row) =>
    row.childId === mark.childId && days.has(row.day) ? { ...row, status: "absent" as const } : row,
  );
  for (const day of days) {
    if (!next.some((row) => row.childId === mark.childId && row.day === day)) {
      next.push({ childId: mark.childId, day, status: "absent" });
    }
  }
  return next;
}

export function reofferSpot(): false {
  return false;
}

export function staffSeesAbsence(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export type RsvpAnswer = "yes" | "no" | "maybe";

function nthSunday(year: number, monthIndex: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
}

function winnipegName(date: Date): "CST" | "CDT" {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 8, 0, 0);
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 7, 0, 0);
  const time = date.getTime();
  return time >= start && time < end ? "CDT" : "CST";
}

export function eventZoneLabel(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const zone = String(timeZone || "").trim() || "America/Winnipeg";
  if (zone === "America/Winnipeg") {
    const name = winnipegName(date);
    const shift = (name === "CDT" ? -5 : -6) * 60 * 60 * 1000;
    const local = new Date(date.getTime() + shift);
    const hour24 = local.getUTCHours();
    const minute = String(local.getUTCMinutes()).padStart(2, "0");
    const hour12 = hour24 % 12 || 12;
    const period = hour24 >= 12 ? "p.m." : "a.m.";
    return `${hour12}:${minute} ${period} ${name}`;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value || "";
    const minute = parts.find((part) => part.type === "minute")?.value || "";
    const day = parts.find((part) => part.type === "dayPeriod")?.value || "";
    const name = parts.find((part) => part.type === "timeZoneName")?.value || "";
    return [hour && minute ? `${hour}:${minute}` : "", day, name].filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

export function canCreateEvent(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function parentCanRsvp(input: { role: string | null | undefined; audience: "centre" | "room"; roomId: string | null; parentRoomId: string | null }): boolean {
  if (input.role !== "parent") return false;
  if (input.audience === "centre") return true;
  return Boolean(input.roomId && input.roomId === input.parentRoomId);
}

export function rsvpHeadcount(answer: RsvpAnswer, count: number): number | null {
  if (!Number.isInteger(count) || count < 0 || count > 12) return null;
  if (answer === "no") return 0;
  if (answer === "yes" && count < 1) return null;
  return count;
}

export function eventSend(): { deliver: false; reason: "in_app" } {
  return { deliver: false, reason: "in_app" };
}

export type ImmunizationStatus = "on_file" | "missing" | "expired";

export function immunizationStatus(input: { hasFile: boolean; expiresOn: string | null; now: Date }): ImmunizationStatus {
  if (!input.hasFile) return "missing";
  if (!input.expiresOn) return "on_file";
  const expires = Date.parse(`${input.expiresOn}T00:00:00.000Z`);
  if (!Number.isFinite(expires)) return "on_file";
  if (input.now.getTime() > expires + 86_400_000) return "expired";
  return "on_file";
}

export function canSeeImmunization(input: {
  role: string | null | undefined;
  ownerId: string;
  viewerId: string;
  centreStaff: boolean;
}): boolean {
  if (!input.viewerId) return false;
  if (input.role === "billing" || input.role === "public") return false;
  if (input.role === "parent") return input.viewerId === input.ownerId;
  if (input.role === "owner" || input.role === "manager" || input.role === "staff") return input.centreStaff;
  return false;
}

export function immunizationViewAudit(input: { childId: string; viewerId: string; at: string }): { childId: string; viewerId: string; at: string; action: "view" } | null {
  if (!input.childId || !input.viewerId) return null;
  return { childId: input.childId, viewerId: input.viewerId, at: input.at, action: "view" };
}

export function healthScore(): null {
  return null;
}

export function miniSiteOpen(input: { claimed: boolean; slug: string }): boolean {
  return input.claimed && /^[a-z0-9-]{2,80}$/.test(input.slug);
}

export function miniSitePath(slug: string): string {
  return `/c/${slug}`;
}

export function copyEndorsesCentre(text: string): boolean {
  return /certif|endors|approuv|recommandé par kidease|certified by kidease/i.test(text);
}

export type ForecastChild = { id: string; birth: string; roomId: string };
export type ForecastRoom = { id: string; minMonths: number; maxMonths: number };
export type ForecastWait = { childId: string; start: string; ageMonths: number | null };

function monthsOld(birth: string, on: string): number | null {
  const born = Date.parse(`${birth}T00:00:00.000Z`);
  const when = Date.parse(`${on}T00:00:00.000Z`);
  if (!Number.isFinite(born) || !Number.isFinite(when) || when < born) return null;
  return Math.floor((when - born) / (86_400_000 * 30.4375));
}

export function roomForecast(input: {
  children: readonly ForecastChild[];
  rooms: readonly ForecastRoom[];
  waitlist: readonly ForecastWait[];
  today: string;
}): { roomId: string; opensOn: string; why: string; estimate: true }[] {
  const out: { roomId: string; opensOn: string; why: string; estimate: true }[] = [];
  for (const room of input.rooms) {
    for (const child of input.children) {
      if (child.roomId !== room.id) continue;
      for (let step = 0; step < 36; step += 1) {
        const on = new Date(Date.parse(`${input.today}T00:00:00.000Z`) + step * 86_400_000).toISOString().slice(0, 10);
        const age = monthsOld(child.birth, on);
        if (age != null && age > room.maxMonths) {
          out.push({
            roomId: room.id,
            opensOn: on,
            why: `Child ${child.id} ages out of this room.`,
            estimate: true,
          });
          break;
        }
      }
    }
    for (const wait of input.waitlist) {
      if (wait.ageMonths == null || wait.ageMonths < room.minMonths || wait.ageMonths > room.maxMonths) continue;
      if (wait.start < input.today) continue;
      out.push({
        roomId: room.id,
        opensOn: wait.start,
        why: `Waitlist child ${wait.childId} asked to start then.`,
        estimate: true,
      });
    }
  }
  return out;
}

export function forecastVisible(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export function publishForecast(): false {
  return false;
}
