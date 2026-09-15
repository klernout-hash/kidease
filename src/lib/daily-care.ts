/**
 * Daily-care (ops-lite) helpers. Pure — no DB, no Start.
 *
 * NOW: parent ↔ centre /inbox (already live), per-child check-in/out,
 * and daily journals (text + photos).
 * NEXT: medication schedules + dose audit, incident reports, room counts,
 * and a same-day staff roster. Not a Fastoche replacement.
 *
 * FEATURE_INAPP_CHAT stays off. That flag is the guest HelpBot / admin
 * chat lab — not parent ↔ daycare threads. Live messages stay on /inbox
 * for claimed centres, enrolled/linked children, and inquiry threads.
 * Care notices are transactional thread/email only — no commercial SMS.
 */

export const ATTENDANCE_STATUSES = ["scheduled", "arrived", "departed", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string | null | undefined): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes((value || "").trim());
}

export const DAILY_CARE_HONESTY =
  "Ops-lite for claimed centres and enrolled children: check-in, journal, messages, medication logs, incident reports, room counts, and today's roster. Not timesheets, tuition billing, provincial subsidy workflows, or a Fastoche replacement.";

export const CARE_OPS_LATER_OUT_OF_SCOPE =
  "Not in this phase: staff timesheets / payroll, full centre tuition billing, or provincial subsidy workflows.";

export const JOURNAL_MAX_PHOTOS = 4;
export const JOURNAL_MAX_PHOTO_BYTES = 1_800_000;
export const JOURNAL_MAX_BODY = 2_000;
export const JOURNAL_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type CarePresence = "here" | "picked_up" | "expected" | "absent";
export type CareAttendanceAction = "check_in" | "check_out" | "absent";
export type CareDeskRole = "parent" | "provider";
export type CareStatusKind = CareAttendanceAction | "journal" | "medication" | "incident";

export const MED_LOG_STATUSES = ["given", "missed", "refused", "held"] as const;
export type MedLogStatus = (typeof MED_LOG_STATUSES)[number];

export const INCIDENT_KINDS = ["fall", "bump", "bite", "scrape", "illness", "other"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const ROOM_CAPACITY_MIN = 1;
export const ROOM_CAPACITY_MAX = 80;
export const MED_NAME_MAX = 120;
export const MED_DOSAGE_MAX = 80;
export const MED_INSTRUCTIONS_MAX = 1_000;
export const INCIDENT_TEXT_MAX = 4_000;
export const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type JournalPhoto = {
  src: string;
  name?: string;
};

export function isEnrolledBookingStatus(status: string | null | undefined): boolean {
  return status === "accepted" || status === "active";
}

/** Parent may message a centre they already have a thread with, or an enrolled link. */
export function parentCanMessageCentre(input: {
  hasConversation: boolean;
  enrolled: boolean;
}): boolean {
  return Boolean(input.hasConversation || input.enrolled);
}

/** Staff at a claimed/member centre may reply on an existing inquiry or enrolled thread. */
export function centreCanMessageParent(input: {
  claimedOrStaff: boolean;
  hasConversation: boolean;
}): boolean {
  return Boolean(input.claimedOrStaff && input.hasConversation);
}

export function canOpenCareThread(input: {
  claimedOrStaff?: boolean;
  enrolled: boolean;
  hasConversation: boolean;
}): boolean {
  if (input.hasConversation || input.enrolled) return true;
  return false;
}

export function presenceFromAttendance(status: AttendanceStatus | string | null | undefined): CarePresence {
  if (status === "arrived") return "here";
  if (status === "departed") return "picked_up";
  if (status === "absent") return "absent";
  return "expected";
}

export function attendanceFromAction(action: CareAttendanceAction): AttendanceStatus {
  if (action === "check_in") return "arrived";
  if (action === "check_out") return "departed";
  return "absent";
}

export function canMarkAttendance(role: CareDeskRole | "read_only" | "none"): boolean {
  return role === "parent" || role === "provider";
}

export function isJournalImageType(type: string | null | undefined): boolean {
  const t = (type || "").trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("video/")) return false;
  return (JOURNAL_ALLOWED_TYPES as readonly string[]).includes(t);
}

export function journalPhotoDecision(input: { type: string; size: number }): "ok" | "video" | "type" | "size" {
  const type = (input.type || "").trim().toLowerCase();
  if (type.startsWith("video/")) return "video";
  if (!isJournalImageType(type)) return "type";
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > JOURNAL_MAX_PHOTO_BYTES) return "size";
  return "ok";
}

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[a-z0-9+/=\s]+$/i;

export function isJournalPhotoSrc(src: string | null | undefined): boolean {
  const value = (src || "").trim();
  if (!value) return false;
  if (value.startsWith("data:video/")) return false;
  return DATA_URL_RE.test(value) || /^https?:\/\//i.test(value) || value.startsWith("/img?");
}

export function parseJournalPhotos(raw: unknown): JournalPhoto[] {
  let list: unknown[] = [];
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as unknown;
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const out: JournalPhoto[] = [];
  for (const item of list) {
    if (typeof item === "string" && isJournalPhotoSrc(item)) {
      out.push({ src: item });
    } else if (item && typeof item === "object") {
      const src = String((item as { src?: unknown }).src ?? "").trim();
      const name = String((item as { name?: unknown }).name ?? "").trim();
      if (isJournalPhotoSrc(src)) out.push({ src, name: name || undefined });
    }
    if (out.length >= JOURNAL_MAX_PHOTOS) break;
  }
  return out;
}

export function serializeJournalPhotos(photos: JournalPhoto[]): string {
  return JSON.stringify(
    photos.slice(0, JOURNAL_MAX_PHOTOS).map((p) => ({
      src: p.src,
      ...(p.name ? { name: p.name } : {}),
    })),
  );
}

export function normalizeJournalBody(raw: string | null | undefined): string {
  return (raw || "").replace(/\s+/g, " ").trim().slice(0, JOURNAL_MAX_BODY);
}

export function journalPostReady(input: { body: string; photos: JournalPhoto[] }): boolean {
  if (input.photos.length > JOURNAL_MAX_PHOTOS) return false;
  if (input.photos.some((p) => !isJournalPhotoSrc(p.src))) return false;
  return Boolean(normalizeJournalBody(input.body) || input.photos.length);
}

export function careStatusBody(input: {
  kind: CareStatusKind;
  childName: string;
  daycareName: string;
  locale?: "en" | "fr" | string;
  medicationName?: string;
  doseStatus?: MedLogStatus;
  incidentKind?: IncidentKind | string;
}): string {
  const child = (input.childName || "Child").trim() || "Child";
  const fr = input.locale === "fr";
  if (input.kind === "check_in") {
    return fr ? `${child} est arrivé(e) à ${input.daycareName}.` : `${child} checked in at ${input.daycareName}.`;
  }
  if (input.kind === "check_out") {
    return fr ? `${child} a été récupéré(e) à ${input.daycareName}.` : `${child} was picked up from ${input.daycareName}.`;
  }
  if (input.kind === "absent") {
    return fr ? `${child} est absent(e) aujourd’hui à ${input.daycareName}.` : `${child} is marked absent at ${input.daycareName} today.`;
  }
  if (input.kind === "medication") {
    const med = (input.medicationName || "medication").trim() || "medication";
    const status = input.doseStatus || "given";
    if (fr) {
      return `Dose de ${med} pour ${child} à ${input.daycareName} : ${status}. Ouvrez Soins du jour pour le journal d’audit.`;
    }
    return `${med} for ${child} at ${input.daycareName}: ${status}. Open Daily care for the audit log.`;
  }
  if (input.kind === "incident") {
    const kind = (input.incidentKind || "incident").trim() || "incident";
    if (fr) {
      return `Rapport d’incident (${kind}) pour ${child} à ${input.daycareName}. Ouvrez Soins du jour pour le détail.`;
    }
    return `Incident report (${kind}) for ${child} at ${input.daycareName}. Open Daily care for the full report.`;
  }
  return fr
    ? `Nouveau journal du jour pour ${child} à ${input.daycareName}. Ouvrez Daily care pour le texte et les photos.`
    : `New daily journal for ${child} at ${input.daycareName}. Open Daily care for the note and photos.`;
}

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isMedLogStatus(value: string | null | undefined): value is MedLogStatus {
  return (MED_LOG_STATUSES as readonly string[]).includes((value || "").trim());
}

export function isIncidentKind(value: string | null | undefined): value is IncidentKind {
  return (INCIDENT_KINDS as readonly string[]).includes((value || "").trim());
}

export function normalizeHhMm(raw: string | null | undefined): string | null {
  const value = (raw || "").trim();
  if (!HH_MM_RE.test(value)) return null;
  return value;
}

export function parseScheduleTimes(raw: unknown): string[] {
  let list: unknown[] = [];
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text) as unknown;
        list = Array.isArray(parsed) ? parsed : [];
      } catch {
        list = text.split(",");
      }
    } else {
      list = text.split(/[,;\n]+/);
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const time = normalizeHhMm(typeof item === "string" ? item : String(item ?? ""));
    if (!time || seen.has(time)) continue;
    seen.add(time);
    out.push(time);
    if (out.length >= 8) break;
  }
  return out.sort();
}

export function serializeScheduleTimes(times: string[]): string {
  return JSON.stringify(parseScheduleTimes(times));
}

export function clampRoomCapacity(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(ROOM_CAPACITY_MAX, Math.max(ROOM_CAPACITY_MIN, Math.round(n)));
}

export function medicationActiveOnDay(input: {
  startDay: string;
  endDay?: string | null;
  archivedAt?: string | null;
  day: string;
}): boolean {
  if (input.archivedAt) return false;
  if (input.day < input.startDay) return false;
  if (input.endDay && input.day > input.endDay) return false;
  return true;
}

export function medicationPostReady(input: {
  name: string;
  dosage: string;
  times: string[];
}): boolean {
  return Boolean((input.name || "").trim() && (input.dosage || "").trim() && input.times.length > 0);
}

export function incidentPostReady(input: {
  kind: string;
  description: string;
}): boolean {
  return isIncidentKind(input.kind) && Boolean((input.description || "").replace(/\s+/g, " ").trim());
}

export function canManageRooms(role: CareDeskRole | "read_only" | "none"): boolean {
  return role === "provider";
}

export function canAssignRoster(role: CareDeskRole | "read_only" | "none"): boolean {
  return role === "provider";
}

export function canScheduleMedication(role: CareDeskRole | "read_only" | "none"): boolean {
  return role === "parent" || role === "provider";
}

export function canLogMedicationDose(role: CareDeskRole | "read_only" | "none"): boolean {
  return role === "provider";
}

export function canSubmitIncident(role: CareDeskRole | "read_only" | "none"): boolean {
  return role === "provider";
}

export function childCareKey(input: {
  daycareId: string;
  bookingId?: string | null;
  childName: string;
}): string {
  return `${input.daycareId}:${input.bookingId || input.childName}`;
}

export type RoomCountRow = {
  daycareId: string;
  daycareName: string;
  roomId: string;
  roomName: string;
  capacity: number;
  assigned: number;
  present: number;
  overCapacity: boolean;
  staffNames: string[];
};

export function buildRoomCounts(input: {
  rooms: Array<{
    id: string;
    daycareId: string;
    daycareName: string;
    name: string;
    capacity: number;
  }>;
  assignments: Array<{
    daycareId: string;
    bookingId?: string | null;
    childName: string;
    roomId: string;
  }>;
  attendance: Array<{
    daycareId: string;
    bookingId?: string | null;
    childName: string;
    status: string;
  }>;
  roster: Array<{ roomId: string; staffName: string }>;
}): RoomCountRow[] {
  const presenceByChild = new Map<string, string>();
  for (const row of input.attendance) {
    presenceByChild.set(childCareKey(row), row.status);
  }
  const staffByRoom = new Map<string, string[]>();
  for (const row of input.roster) {
    const names = staffByRoom.get(row.roomId) ?? [];
    if (row.staffName && !names.includes(row.staffName)) names.push(row.staffName);
    staffByRoom.set(row.roomId, names);
  }
  return input.rooms.map((room) => {
    const kids = input.assignments.filter((a) => a.roomId === room.id);
    let present = 0;
    for (const kid of kids) {
      if (presenceByChild.get(childCareKey(kid)) === "arrived") present += 1;
    }
    const capacity = clampRoomCapacity(room.capacity);
    return {
      daycareId: room.daycareId,
      daycareName: room.daycareName,
      roomId: room.id,
      roomName: room.name,
      capacity,
      assigned: kids.length,
      present,
      overCapacity: present > capacity,
      staffNames: staffByRoom.get(room.id) ?? [],
    };
  });
}

export function latestLogForSlot(input: {
  logs: Array<{
    medicationId: string;
    day: string;
    scheduledTime: string;
    createdAt: string;
    status: string;
  }>;
  medicationId: string;
  day: string;
  scheduledTime: string;
}): { status: string; createdAt: string } | null {
  const hits = input.logs
    .filter(
      (log) =>
        log.medicationId === input.medicationId &&
        log.day === input.day &&
        log.scheduledTime === input.scheduledTime,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return hits[0] ? { status: hits[0].status, createdAt: hits[0].createdAt } : null;
}
