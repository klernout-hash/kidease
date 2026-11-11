/**
 * Tour confirmation, centre context, and the one follow-up after a visit.
 * No mail leaves this file. scripts/tour-phase0.test.mjs loads it in Node.
 */
import { quietHourInZone } from "./family-time.ts";
import { buildTourIcs } from "./tour-ics.ts";

export type TourNotice = "booked" | "rescheduled" | "cancelled";

const QUIET_NOTE = "quiet";

export function tourConfirmKey(tourId: string, event: TourNotice, version: number): string {
  const id = tourId.trim();
  const ver = Number.isFinite(version) ? Math.max(0, Math.floor(version)) : 0;
  return `${id}:${event}:${ver}`;
}

export type TourConfirmPlan = {
  deliver: false;
  reason: "flag_off" | "pre_enable" | "duplicate" | "held";
  key: string;
  event: "tour_confirmation_sent" | "tour_confirmation_failed";
  locale: "en" | "fr";
  channel: "email";
};

/**
 * Outbound stays off. A matching event after the enable time is recorded once
 * as held. Tours from before that time are not replayed.
 */
export function planTourConfirmation(input: {
  flagOn: boolean;
  tourId: string;
  event: TourNotice;
  version: number;
  occurredAt: string;
  enabledAt: string | null;
  alreadyHeld: boolean;
  locale?: "en" | "fr";
}): TourConfirmPlan {
  const key = tourConfirmKey(input.tourId, input.event, input.version);
  const locale = input.locale === "fr" ? "fr" : "en";
  if (!input.flagOn) return { deliver: false, reason: "flag_off", key, event: "tour_confirmation_failed", locale, channel: "email" };
  if (input.alreadyHeld) return { deliver: false, reason: "duplicate", key, event: "tour_confirmation_failed", locale, channel: "email" };
  const occurred = Date.parse(input.occurredAt);
  const enabled = input.enabledAt ? Date.parse(input.enabledAt) : NaN;
  if (!Number.isFinite(occurred) || !Number.isFinite(enabled) || occurred < enabled) {
    return { deliver: false, reason: "pre_enable", key, event: "tour_confirmation_failed", locale, channel: "email" };
  }
  return { deliver: false, reason: "held", key, event: "tour_confirmation_sent", locale, channel: "email" };
}

export function tourConfirmCopy(input: {
  locale: "en" | "fr";
  centre: string;
  whenLabel: string;
  address: string;
}): { subject: string; text: string } {
  if (input.locale === "fr") {
    return {
      subject: `Visite confirmée à ${input.centre}`,
      text: `Votre visite est le ${input.whenLabel}. Adresse : ${input.address}. Ce message confirme seulement la visite.`,
    };
  }
  return {
    subject: `Tour booked at ${input.centre}`,
    text: `Your tour is ${input.whenLabel}. Address: ${input.address}. This message only confirms the tour.`,
  };
}

/** Wall clock in the centre zone, so a daylight-saving day keeps the local time. */
export function centreWallClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}T${hour}${get("minute")}${get("second")}`;
}

export function tourConfirmIcs(input: {
  tourId: string;
  title: string;
  start: Date;
  end: Date;
  timeZone: string;
  location: string;
  description: string;
}): string {
  const body = buildTourIcs({
    uid: input.tourId,
    title: input.title,
    start: input.start,
    end: input.end,
    location: input.location,
    description: input.description,
  });
  const start = centreWallClock(input.start, input.timeZone);
  const end = centreWallClock(input.end, input.timeZone);
  return body
    .replace(/DTSTART:[^\r\n]+/, `DTSTART;TZID=${input.timeZone}:${start}`)
    .replace(/DTEND:[^\r\n]+/, `DTEND;TZID=${input.timeZone}:${end}`);
}

export type TourCentreDecision =
  | { ok: true; centreId: string }
  | { ok: false; status: 403; reason: "missing" | "not_a_member" };

/** Selected centre must be one this person belongs to. Never fall back to the first. */
export function resolveTourCentre(input: {
  selectedId: string | null | undefined;
  memberships: readonly string[];
}): TourCentreDecision {
  const selected = String(input.selectedId || "").trim();
  if (!selected) return { ok: false, status: 403, reason: "missing" };
  if (!input.memberships.includes(selected)) return { ok: false, status: 403, reason: "not_a_member" };
  return { ok: true, centreId: selected };
}

export function centreSwitchEvent(surface: string): { event: "centre_context_switched"; properties: { surface: string } } {
  const clean = surface.trim().slice(0, 40) || "tours";
  return { event: "centre_context_switched", properties: { surface: clean } };
}

export type FollowupPlan = {
  send: boolean;
  reason: "flag_off" | "enable_time_unset" | "pre_enable" | "cancelled" | "applied" | "waitlist" | "duplicate" | "not_due" | "quiet" | "ready";
  event: "tour_followup_sent" | "tour_followup_skipped";
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function planTourFollowup(input: {
  flagOn: boolean;
  tourAt: string | null;
  enabledAt: string | null;
  now: Date;
  timeZone: string | null;
  cancelled: boolean;
  applied: boolean;
  waitlisted: boolean;
  alreadySent: boolean;
}): FollowupPlan {
  const skip = (reason: FollowupPlan["reason"]): FollowupPlan => ({
    send: false,
    reason,
    event: "tour_followup_skipped",
  });
  if (!input.flagOn) return skip("flag_off");
  if (input.cancelled) return skip("cancelled");
  if (input.applied) return skip("applied");
  if (input.waitlisted) return skip("waitlist");
  if (input.alreadySent) return skip("duplicate");
  const enabled = input.enabledAt ? Date.parse(input.enabledAt) : NaN;
  if (!Number.isFinite(enabled)) return skip("enable_time_unset");
  const tourAt = input.tourAt ? Date.parse(input.tourAt) : NaN;
  if (!Number.isFinite(tourAt) || tourAt < enabled) return skip("pre_enable");
  if (input.now.getTime() < tourAt + DAY_MS) return skip("not_due");
  if (quietHourInZone(input.now, input.timeZone)) return skip("quiet");
  return { send: true, reason: "ready", event: "tour_followup_sent" };
}

export function tourNextStepLetter(input: {
  locale: "en" | "fr";
  centre: string;
  applyPath: string;
}): { subject: string; text: string } {
  if (input.locale === "fr") {
    return {
      subject: `Prochaine étape après la visite à ${input.centre}`,
      text: `La visite est passée. Si vous voulez une place, demandez-la ici : ${input.applyPath}. Ceci n’est pas une offre.`,
    };
  }
  return {
    subject: `Next step after your tour at ${input.centre}`,
    text: `The tour is over. If you want a spot, ask here: ${input.applyPath}. This is not an offer.`,
  };
}
