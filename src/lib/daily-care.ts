/**
 * Daily-care (ops-lite) helpers. Pure — no DB, no Start.
 *
 * NOW: parent ↔ centre /inbox (already live), per-child check-in/out,
 * and daily journals (text + photos). Not a Fastoche replacement.
 *
 * FEATURE_INAPP_CHAT stays off. That flag is the guest HelpBot / admin
 * chat lab — not parent ↔ daycare threads. Live messages stay on /inbox
 * for claimed centres, enrolled/linked children, and inquiry threads.
 */

export const ATTENDANCE_STATUSES = ["scheduled", "arrived", "departed", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string | null | undefined): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes((value || "").trim());
}

export const DAILY_CARE_HONESTY =
  "Ops-lite: check-in, a daily journal, and in-app messages. Not medication, accidents, room counts, or billing.";

export const JOURNAL_MAX_PHOTOS = 4;
export const JOURNAL_MAX_PHOTO_BYTES = 1_800_000;
export const JOURNAL_MAX_BODY = 2_000;
export const JOURNAL_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export type CarePresence = "here" | "picked_up" | "expected" | "absent";
export type CareAttendanceAction = "check_in" | "check_out" | "absent";
export type CareDeskRole = "parent" | "provider";

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
  kind: "check_in" | "check_out" | "absent" | "journal";
  childName: string;
  daycareName: string;
  locale?: "en" | "fr" | string;
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
