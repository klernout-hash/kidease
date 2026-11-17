/**
 * The daycare Today screen: arrivals, tours booked today, and requests waiting.
 * The listing checklist is separate and quieter. No invented counts.
 */

import { isOpenLeadStatus, type LeadStatus } from "./lead-requests.ts";

export type TodayTour = {
  id: string;
  status: string;
  parentName?: string | null;
  childName?: string | null;
  preferredTimes?: ReadonlyArray<{ date: string; time?: string }>;
  respondedAt?: string | null;
};

export type TodayLead = { status: string };

const BOOKED = new Set(["accepted", "completed"]);

export function todayKey(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function onDay(value: string | null | undefined, day: string): boolean {
  return String(value || "").slice(0, 10) === day;
}

/** Tours the centre has accepted for this calendar day. Pending requests are not booked. */
export function toursBookedOn(tours: readonly TodayTour[], day: string): TodayTour[] {
  return tours.filter((tour) => {
    if (!BOOKED.has(tour.status)) return false;
    const times = tour.preferredTimes ?? [];
    if (times.some((slot) => onDay(slot.date, day))) return true;
    return times.length === 0 && onDay(tour.respondedAt, day);
  });
}

export function requestsWaiting(leads: readonly TodayLead[], tours: readonly TodayTour[]): number {
  const openLeads = leads.filter((lead) => isOpenLeadStatus(lead.status as LeadStatus)).length;
  const pendingTours = tours.filter((tour) => tour.status === "pending").length;
  return openLeads + pendingTours;
}

export function finishListingCopy(locale: "en" | "fr", missing: number): { title: string; body: string } | null {
  if (missing <= 0) return null;
  if (locale === "fr") {
    return {
      title: "Terminer votre fiche",
      body: missing === 1 ? "Il reste un détail sur votre fiche." : `Il reste ${missing} détails sur votre fiche.`,
    };
  }
  return {
    title: "Finish your listing",
    body: missing === 1 ? "One detail is still missing on your listing." : `${missing} details are still missing on your listing.`,
  };
}
