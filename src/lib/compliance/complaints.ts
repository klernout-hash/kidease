/**
 * Licensing complaint intake. The parent does not have to name a child.
 * SLA days are a KidEase placeholder until the province publishes one.
 */

import type { EnvMap } from "../flags.ts";
import { canSeeProvince, modeFor, type PackMode } from "./mode.ts";
import { isProvinceCode, type ProvinceCode } from "../gov/places.ts";

export const COMPLAINTS_FLAG = "FEATURE_GOV_COMPLAINTS";
export const COMPLAINTS_LIVE_FLAG = "FEATURE_GOV_COMPLAINTS_LIVE";

export const COMPLAINT_KINDS = ["health", "supervision", "premises", "staffing", "fees", "other"] as const;
export type ComplaintKind = (typeof COMPLAINT_KINDS)[number];

export const SLA_BUSINESS_DAYS = 10;
export const SLA_SOURCE =
  "PLACEHOLDER. 10 business days is a KidEase desk target. Confirm the province office standard before treating it as an SLA.";

export function complaintsMode(env: EnvMap): PackMode {
  return modeFor(COMPLAINTS_FLAG, env);
}

export function isComplaintKind(value: string): value is ComplaintKind {
  return (COMPLAINT_KINDS as readonly string[]).includes(value);
}

export function routeComplaint(input: {
  listingProvince: string | null;
  chosenProvince: string | null;
}): ProvinceCode | null {
  const listing = String(input.listingProvince || "").trim().toUpperCase();
  if (isProvinceCode(listing)) return listing;
  const chosen = String(input.chosenProvince || "").trim().toUpperCase();
  return isProvinceCode(chosen) ? chosen : null;
}

export function trackingCode(hex: string): string {
  const clean = hex.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `KE-${clean.padEnd(8, "0")}`;
}

/** Weekdays only. Statutory holidays are not in this count. */
export function addBusinessDays(start: Date, days: number): Date {
  const cursor = new Date(start.getTime());
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return cursor;
}

export function businessDaysBetween(start: Date, now: Date): number {
  if (now.getTime() <= start.getTime()) return 0;
  let count = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  while (cursor.getTime() < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function slaStatus(opened: Date, now: Date, days = SLA_BUSINESS_DAYS): "on_track" | "due_soon" | "overdue" {
  const elapsed = businessDaysBetween(opened, now);
  if (elapsed > days) return "overdue";
  if (elapsed >= days - 2) return "due_soon";
  return "on_track";
}

export function reminderPlan(input: {
  mode: PackMode;
  opened: Date;
  now: Date;
  closed: boolean;
  alreadyReminded: boolean;
}): { remind: boolean; delivery: "skip" | "log" | "send"; status: "on_track" | "due_soon" | "overdue" | "closed" } {
  if (input.closed) return { remind: false, delivery: "skip", status: "closed" };
  const status = slaStatus(input.opened, input.now);
  if (input.mode === "off") return { remind: false, delivery: "skip", status };
  if (status === "on_track" || input.alreadyReminded) return { remind: false, delivery: "skip", status };
  if (input.mode === "dry_run") return { remind: true, delivery: "log", status };
  return { remind: true, delivery: "send", status };
}

export function complaintVisible(input: {
  role: string;
  govProvince: string | null;
  orgProvince?: string | null;
  rowProvince: string;
}): boolean {
  return canSeeProvince(input);
}

export function complaintCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour les parents",
      why: "Envoyez une plainte au bureau de la province. Vous n’avez pas à nommer un enfant.",
      next: "Envoyer la plainte",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint.",
      practice: "Mode pratique : le bureau verrait ceci. Rien n’est envoyé.",
      empty: "Aucune plainte dans votre province.",
      govWhat: "KidEase pour votre province",
      govWhy: "Voyez les plaintes de votre province et les délais.",
    };
  }
  return {
    what: "KidEase for parents",
    why: "Send a complaint to the province office. You do not have to name a child.",
    next: "Send the complaint",
    help: "Help",
    home: "Home",
    off: "This tool is off.",
    practice: "Practice mode: the office would see this. Nothing is sent.",
    empty: "No complaints in your province.",
    govWhat: "KidEase for your province",
    govWhy: "See complaints for your province and the time left.",
  };
}
