/**
 * One definition for tour numbers.
 * Pending tour requests are still waiting. Confirmed tours are accepted visits.
 * Posted tour times are windows the centre published.
 * `booked` on a slot can include waiting requests, so seats use `accepted` only.
 */

export type TourCountSummary = {
  openRequests: number;
  bookedSeats: number;
  postedTimes: number;
};

export type TourCountSlot = {
  pending?: number | null;
  accepted?: number | null;
};

export type TourCountRequest = {
  status?: string | null;
  kind?: string | null;
};

const OPEN_STATUS = new Set(["pending", "requested", "waiting"]);
const BOOKED_STATUS = new Set(["accepted", "confirmed"]);

function whole(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function summarizeTourCounts(input: {
  slots?: readonly TourCountSlot[] | null;
  requests?: readonly TourCountRequest[] | null;
}): TourCountSummary {
  if (input.slots) {
    let openRequests = 0;
    let bookedSeats = 0;
    for (const slot of input.slots) {
      openRequests += whole(slot.pending);
      bookedSeats += whole(slot.accepted);
    }
    return { openRequests, bookedSeats, postedTimes: input.slots.length };
  }
  let openRequests = 0;
  let bookedSeats = 0;
  for (const row of input.requests ?? []) {
    if (row.kind && row.kind !== "tour") continue;
    const status = String(row.status || "").trim().toLowerCase();
    if (OPEN_STATUS.has(status)) openRequests += 1;
    else if (BOOKED_STATUS.has(status)) bookedSeats += 1;
  }
  return { openRequests, bookedSeats, postedTimes: 0 };
}

export const TOUR_COUNT_LABELS = {
  en: {
    openRequests: "Pending tour requests",
    bookedSeats: "Confirmed tours",
    postedTimes: "Posted tour times",
    meaning: "These numbers count tour requests and visits. Pending tour requests still need a reply. Posted tour times are the visit times a centre published.",
  },
  fr: {
    openRequests: "Demandes de visite en attente",
    bookedSeats: "Visites confirmées",
    postedTimes: "Heures de visite publiées",
    meaning: "Ces nombres concernent les demandes de visite et les visites. Les demandes en attente ont besoin d’une réponse. Les heures de visite publiées sont celles qu’un centre a mises en ligne.",
  },
} as const;

export function tourCountLabels(locale: string) {
  return locale === "fr" ? TOUR_COUNT_LABELS.fr : TOUR_COUNT_LABELS.en;
}

export function tourCountLine(counts: TourCountSummary, locale: string): string {
  const labels = tourCountLabels(locale);
  return `${labels.openRequests} ${counts.openRequests}. ${labels.bookedSeats} ${counts.bookedSeats}. ${labels.postedTimes} ${counts.postedTimes}.`;
}
