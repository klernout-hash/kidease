import { checkoutAllowed } from "./gap-features.ts";
import type { CentreMemberRole } from "./centre-roles.ts";
import { isVercelProduction } from "./channel-readiness.ts";
import type { EnvMap } from "./flags.ts";

export type DoorAction = "check_in" | "check_out";
export type AttendanceStatus = "expected" | "here" | "picked_up";

export type DoorEvent = {
  id: string;
  action: DoorAction;
  at: string;
  pickupName: string;
  correctionOf: string | null;
  reason: string;
};

export const DEMO_CENTRE_ID = "demo-att-centre";
export const DEMO_CENTRE_SLUG = "demo-attendance-qa";
export const DEMO_CENTRE_NAME = "DEMO QA Centre";
export const DEMO_PICKUP = "DEMO Parker";
export const DEMO_NOTICE = "DEMO Quinn";

export const DEMO_CHILDREN = [
  { key: "avery", name: "DEMO Avery", birthdate: "2021-04-02" },
  { key: "blair", name: "DEMO Blair", birthdate: "2022-09-18" },
  { key: "casey", name: "DEMO Casey", birthdate: "2023-01-07" },
] as const;

/** Local preview only. Production stays on the normal flag, which defaults off. */
export function attendancePreviewEnabled(env?: EnvMap): boolean {
  if (isVercelProduction(env)) return false;
  const source = env ?? (typeof process !== "undefined" ? (process.env as EnvMap) : undefined);
  return String(source?.KIDEASE_ATTENDANCE_PREVIEW ?? "").trim() === "1";
}

export function centreLocalDay(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "America/Winnipeg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Winnipeg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

export function canConfirmHandoff(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export function canCorrectAttendance(role: CentreMemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** Latest action after manager corrections. Original rows stay in the list. */
export function effectiveDoorAction(events: readonly DoorEvent[]): DoorAction | null {
  const correction = new Map<string, DoorEvent>();
  for (const event of events) {
    if (event.correctionOf) correction.set(event.correctionOf, event);
  }
  let last: DoorAction | null = null;
  for (const event of events) {
    if (event.correctionOf) continue;
    last = (correction.get(event.id) ?? event).action;
  }
  return last;
}

export function attendanceStatus(last: DoorAction | null): AttendanceStatus {
  if (last === "check_in") return "here";
  if (last === "check_out") return "picked_up";
  return "expected";
}

export function nextHandoffAction(last: DoorAction | null): DoorAction {
  return last === "check_in" ? "check_out" : "check_in";
}

export function headcount(rows: readonly { last: DoorAction | null }[]): number {
  return rows.filter((row) => row.last === "check_in").length;
}

export function idempotencyKey(bookingId: string, localDay: string, action: DoorAction): string {
  return `${bookingId}:${localDay}:${action}`;
}

export function correctionKey(bookingId: string, localDay: string, targetId: string): string {
  return `${bookingId}:${localDay}:correction:${targetId}`;
}

/**
 * Pickup names come only from the pickup list.
 * A person who is told about attendance cannot collect the child.
 */
export function handoffCheckout(input: {
  pickupName: string;
  pickupNames: readonly string[];
  noticeNames: readonly string[];
}): { ok: true; pickup: string } | { ok: false; reason: "need_pickup" | "not_authorized" | "notice_is_not_pickup" } {
  const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const typed = input.pickupName.replace(/\s+/g, " ").trim();
  const onNotice = input.noticeNames.some((name) => key(name) === key(typed) && key(typed).length > 0);
  const onPickup = input.pickupNames.some((name) => key(name) === key(typed));
  if (onNotice && !onPickup) return { ok: false, reason: "notice_is_not_pickup" };
  const decision = checkoutAllowed(typed, input.pickupNames.map((name) => ({ name })));
  if (!decision.ok) return decision;
  return { ok: true, pickup: decision.pickup };
}

export function correctionAllowed(input: {
  role: CentreMemberRole | null | undefined;
  reason: string;
}): { ok: true; reason: string } | { ok: false; error: string } {
  if (!canCorrectAttendance(input.role)) return { ok: false, error: "Only a manager can correct attendance." };
  const reason = input.reason.replace(/\s+/g, " ").trim();
  if (reason.length < 8) return { ok: false, error: "Add a short reason." };
  return { ok: true, reason: reason.slice(0, 200) };
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part && part !== "DEMO");
  const letters = (parts.length ? parts : name.trim().split(/\s+/)).slice(0, 2);
  return letters.map((part) => part.slice(0, 1).toUpperCase()).join("") || "?";
}

export const ATTENDANCE_COPY = {
  en: {
    title: "Today",
    lead: "Staff confirm each arrival and pickup. A child is here only after that.",
    here: "Here",
    expected: "Expected",
    pickedUp: "Picked up",
    headcount: "{count} here now",
    checkIn: "Check in",
    checkOut: "Check out",
    pickup: "Who is picking up",
    saved: "Saved.",
    already: "Already saved for today.",
    held: "Notice held. Nothing was sent.",
    none: "No notice to send.",
    codeLater: "A personal arrival code is not available. Staff confirm every arrival and pickup.",
    correct: "Correct this",
    reason: "Reason",
    correctIn: "Mark not still here",
    correctOut: "Mark still here",
    noPhoto: "No photo is stored.",
    parentTitle: "Attendance",
    parentLead: "Times the centre confirmed. Only you see your own children.",
    demo: "Demo children. Not real people.",
    closed: "This attendance preview is closed.",
    signIn: "Sign in to add the demo children to your account.",
    add: "Add three demo children",
    added: "Demo children are on this account. Open Today at the centre, or stay here as the parent.",
    staffLink: "Open staff Today",
    parentLink: "Open your profile",
  },
  fr: {
    title: "Aujourd'hui",
    lead: "Le personnel confirme chaque arrivée et chaque départ. L'enfant est ici seulement après ça.",
    here: "Ici",
    expected: "Attendu",
    pickedUp: "Parti",
    headcount: "{count} ici maintenant",
    checkIn: "Arrivée",
    checkOut: "Départ",
    pickup: "Qui vient chercher",
    saved: "Enregistré.",
    already: "Déjà enregistré pour aujourd'hui.",
    held: "Avis gardé. Rien n'a été envoyé.",
    none: "Aucun avis à envoyer.",
    codeLater: "Un code personnel d'arrivée n'est pas prêt. Le personnel confirme chaque arrivée et chaque départ.",
    correct: "Corriger",
    reason: "Raison",
    correctIn: "Marquer plus ici",
    correctOut: "Marquer encore ici",
    noPhoto: "Aucune photo n'est gardée.",
    parentTitle: "Présences",
    parentLead: "Heures confirmées par le centre. Vous voyez seulement vos propres enfants.",
    demo: "Enfants de démonstration. Ce ne sont pas de vraies personnes.",
    closed: "Cet aperçu des présences est fermé.",
    signIn: "Connectez-vous pour ajouter les enfants de démonstration à votre compte.",
    add: "Ajouter trois enfants de démonstration",
    added: "Les enfants de démonstration sont sur ce compte. Ouvrez Aujourd'hui au centre, ou restez ici comme parent.",
    staffLink: "Ouvrir Aujourd'hui du personnel",
    parentLink: "Ouvrir votre profil",
  },
} as const;

export function attendanceCopy(locale: string) {
  return locale === "fr" ? ATTENDANCE_COPY.fr : ATTENDANCE_COPY.en;
}
