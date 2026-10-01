/**
 * Parent waitlist tracker. Status labels only. No other parent's name, email, or child.
 * Spot alerts can read open rows through waitlistEntriesForAlerts.
 */

import { isAlertQuietHours } from "./search-alert-policy.ts";

export const WAITLIST_EVENTS = ["waitlist_viewed", "waitlist_status_changed", "waitlist_withdrawn"] as const;

export const PARENT_WAITLIST_STATUSES = [
  "sent",
  "seen",
  "waitlisted",
  "offered",
  "declined",
  "withdrawn",
] as const;

export type ParentWaitlistStatus = (typeof PARENT_WAITLIST_STATUSES)[number];

const STATUS_FROM_BOOKING: Record<string, ParentWaitlistStatus> = {
  requested: "sent",
  under_review: "seen",
  waitlist: "waitlisted",
  accepted: "offered",
  active: "offered",
  declined: "declined",
  cancelled: "withdrawn",
};

const LABEL_EN: Record<ParentWaitlistStatus, string> = {
  sent: "Sent",
  seen: "Seen",
  waitlisted: "Waitlisted",
  offered: "Offered",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const LABEL_FR: Record<ParentWaitlistStatus, string> = {
  sent: "Envoyée",
  seen: "Vue",
  waitlisted: "En attente",
  offered: "Offerte",
  declined: "Refusée",
  withdrawn: "Retirée",
};

export function parentWaitlistStatus(raw: unknown): ParentWaitlistStatus | null {
  const key = String(raw ?? "").trim();
  return STATUS_FROM_BOOKING[key] ?? null;
}

export function canWithdrawWaitlist(status: ParentWaitlistStatus): boolean {
  return status === "sent" || status === "seen" || status === "waitlisted" || status === "offered";
}

/** Open rows spot alerts may match later. Declined and withdrawn are not a fit. */
export function waitlistEntriesForAlerts<T extends { status: string }>(rows: T[]): Array<Omit<T, "email" | "childName" | "parentName" | "phone">> {
  return rows.flatMap((row) => {
    const status = parentWaitlistStatus(row.status);
    if (status !== "sent" && status !== "seen" && status !== "waitlisted") return [];
    const copy = { ...row } as Record<string, unknown>;
    delete copy.email;
    delete copy.childName;
    delete copy.parentName;
    delete copy.phone;
    return [copy as Omit<T, "email" | "childName" | "parentName" | "phone">];
  });
}

export function waitlistEmailAllowed(input: { quiet: boolean; emailConsent: boolean; suppressed: boolean }): boolean {
  if (input.quiet || !input.emailConsent || input.suppressed) return false;
  return true;
}

export function waitlistQuietNow(now: Date = new Date()): boolean {
  return isAlertQuietHours(now);
}

export function waitlistEventProps(input: { daycareId?: string; status?: string; count?: number } = {}) {
  const props: Record<string, string | number> = {};
  const id = String(input.daycareId || "").trim();
  if (id && !id.includes("@")) props.daycare_id = id.slice(0, 80);
  const status = parentWaitlistStatus(input.status) || (PARENT_WAITLIST_STATUSES.includes(input.status as ParentWaitlistStatus) ? input.status : "");
  if (status) props.status = status;
  if (typeof input.count === "number" && Number.isFinite(input.count)) props.count = Math.max(0, Math.round(input.count));
  return props;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;")
    .replace(/'/g, "&#39;");
}

export function waitlistStatusEmail(input: { centre: string; status: ParentWaitlistStatus }): { subject: string; text: string; html: string } {
  const centre = input.centre.replace(/\s+/g, " ").trim().slice(0, 80) || "A centre";
  const en = LABEL_EN[input.status];
  const fr = LABEL_FR[input.status];
  const href = "https://www.kidease.ca/parent?tab=waitlists";
  const safe = escapeHtml(centre);
  return {
    subject: `KidEase: ${centre} updated your spot request`,
    text: [
      `${centre} updated your spot request to ${en}.`,
      `${centre} a mis à jour votre demande de place : ${fr}.`,
      `Open My waitlists: ${href}`,
    ].join("\n\n"),
    html: `<p>${safe} updated your spot request to ${escapeHtml(en)}.</p><p>${safe} a mis à jour votre demande de place : ${escapeHtml(fr)}.</p><p><a href="${href}">My waitlists</a></p>`,
  };
}
