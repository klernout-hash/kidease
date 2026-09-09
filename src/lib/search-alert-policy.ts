/**
 * Honest saved-search alert rules.
 *
 * A ping fires only from known facts. Never invent a seat, a Match score,
 * a $10-a-day badge, or an age overlap on empty ages.
 * Alerts do not use Match / Urgency / Guest Favorites.
 *
 * Relative imports only — scripts/*.test.mjs load this file with Node.
 */
import { classifyFacilityType, type FacilityType } from "./facility-type.ts";
import { isPublicListing, listingVisibilityInputFromDb } from "./listing-visibility.ts";

export const ALERT_TZ = "America/Winnipeg";
export const ALERT_SILENCE_MS = 72 * 60 * 60 * 1000;
export const ALERT_PUSH_SMS_DAILY_CAP = 3;
export const ALERT_EMAIL_DAY_MS = 24 * 60 * 60 * 1000;
/** Same 14-day window as listing-readiness vacancy freshness. */
export const VACANCY_CONFIRM_MAX_MS = 14 * 24 * 60 * 60 * 1000;

export type HonestAlertKind = "new_centre" | "vacancy_reconfirmed" | "request_reply";
export type AlertAgeBand = "any" | "infant" | "toddler" | "preschool" | "school-age";

export type AlertMatchFacts = {
  id: string;
  slug: string;
  name: string;
  city: string;
  live?: boolean;
  claimed?: boolean;
  agesKnown?: boolean;
  ageMinMonths: number;
  ageMaxMonths: number;
  lastVacancyUpdatedAt?: string | null;
  createdAt?: string | null;
  distanceKm: number;
  amenities?: string;
  visibility?: string | null;
  isTest?: boolean | number | null;
  facilityType?: FacilityType;
};

export type PlannedAlertEvent = {
  daycareId: string;
  slug: string;
  name: string;
  city: string;
  kind: HonestAlertKind;
  distanceKm: number;
  vacancyAt: string | null;
  facilityType: FacilityType;
};

export type SeenAlertState = {
  seenNew: Set<string>;
  seenVacancy: Map<string, string | null>;
  /** `${daycareId}:${kind}` → last notified epoch ms. */
  lastNotifiedAt: Map<string, number>;
};

function silenceKey(daycareId: string, kind: HonestAlertKind) {
  return `${daycareId}:${kind}`;
}

function vacancyFresh(updatedAt: string | null | undefined, nowMs: number): boolean {
  if (!updatedAt) return false;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= VACANCY_CONFIRM_MAX_MS;
}

/** Winnipeg clock hour 0–23. Midnight is 0, never 24. */
export function winnipegHour(now: Date = new Date()): number {
  const raw = new Intl.DateTimeFormat("en-CA", {
    timeZone: ALERT_TZ,
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour)) return 0;
  if (hour === 24) return 0;
  return hour;
}

export function winnipegDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ALERT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Quiet hours 21:00–08:00 America/Winnipeg — hold email, still allow in-app. */
export function isAlertQuietHours(now: Date = new Date()): boolean {
  const hour = winnipegHour(now);
  return hour >= 21 || hour < 8;
}

export function canSendDigestEmail(lastEmailAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (isAlertQuietHours(now)) return false;
  if (!lastEmailAt) return true;
  const ts = lastEmailAt instanceof Date ? lastEmailAt.getTime() : Date.parse(String(lastEmailAt));
  if (!Number.isFinite(ts)) return true;
  return now.getTime() - ts >= ALERT_EMAIL_DAY_MS;
}

export function withinCentreTypeSilence(lastNotifiedMs: number | null | undefined, nowMs: number): boolean {
  if (lastNotifiedMs == null || !Number.isFinite(lastNotifiedMs)) return false;
  return nowMs - lastNotifiedMs < ALERT_SILENCE_MS;
}

export function underPushSmsDailyCap(sentToday: number): boolean {
  return sentToday < ALERT_PUSH_SMS_DAILY_CAP;
}

export function alertFacilityType(row: Pick<AlertMatchFacts, "amenities" | "name" | "facilityType">): FacilityType {
  if (row.facilityType) return row.facilityType;
  return classifyFacilityType({ amenities: row.amenities || "", name: row.name || "" }).type;
}

export function licensedTypeLabel(type: FacilityType): string {
  if (type === "nursery") return "nursery";
  if (type === "home") return "home";
  return "centre";
}

/**
 * Vacancy pings: Live + claimed + confirm < 14 days only.
 * Unclaimed or stale confirm never emails “a spot may be open.”
 */
export function vacancyPingEligible(
  row: Pick<AlertMatchFacts, "live" | "claimed" | "lastVacancyUpdatedAt">,
  nowMs: number = Date.now(),
): boolean {
  if (row.live !== true) return false;
  if (row.claimed !== true) return false;
  return vacancyFresh(row.lastVacancyUpdatedAt, nowMs);
}

export function publicCentreEligible(
  row: Pick<AlertMatchFacts, "id" | "slug" | "name" | "visibility" | "isTest">,
): boolean {
  return isPublicListing(
    listingVisibilityInputFromDb({
      id: row.id,
      slug: row.slug,
      name: row.name,
      visibility: row.visibility,
      is_test: row.isTest,
    }),
  );
}

export function ageBandLabel(ageBand: AlertAgeBand): string {
  if (ageBand === "infant") return "infant";
  if (ageBand === "toddler") return "toddler";
  if (ageBand === "preschool") return "preschool";
  if (ageBand === "school-age") return "school-age";
  return "any age";
}

/** Transactional copy only. Never “guaranteed opening.” */
export function honestAlertCopy(input: {
  kind: HonestAlertKind;
  name: string;
  distanceKm: number;
  ageBand?: AlertAgeBand;
  originLabel?: string;
  facilityType?: FacilityType;
}): { title: string; body: string } {
  const km = Number.isFinite(input.distanceKm) ? Math.round(input.distanceKm * 10) / 10 : 0;
  const age = ageBandLabel(input.ageBand ?? "any");
  if (input.kind === "vacancy_reconfirmed") {
    const title = `A spot may be open at ${input.name} · ${km} km · ${age}. Confirm with the centre.`;
    return { title, body: "This is not a guaranteed opening. Confirm with the centre." };
  }
  if (input.kind === "request_reply") {
    return { title: `${input.name} replied.`, body: "Open the thread to read the reply." };
  }
  const type = licensedTypeLabel(input.facilityType ?? "centre");
  const place = (input.originLabel || "").split(",")[0]?.trim() || "you";
  return {
    title: `New licensed ${type} near ${place}.`,
    body: `${input.name} · ${km} km`,
  };
}

export function requestReplyCopy(centreName: string): { title: string; body: string } {
  return honestAlertCopy({ kind: "request_reply", name: centreName, distanceKm: 0 });
}

export function requestReplyPath(conversationId: string): string {
  return `/inbox/${conversationId}`;
}

/**
 * First cron run still baselines (notify=false). Later runs emit new_centre
 * and vacancy_reconfirmed only when facts are new since last_checked_at,
 * the centre is public, and the same centre+type is outside the 72h silence.
 */
export function planSearchAlertEvents(input: {
  baseline: boolean;
  sinceMs: number;
  nowMs: number;
  matches: AlertMatchFacts[];
  seen: SeenAlertState;
}): PlannedAlertEvent[] {
  const events: PlannedAlertEvent[] = [];
  for (const hit of input.matches) {
    if (!publicCentreEligible(hit)) continue;
    const type = alertFacilityType(hit);
    const km = Number.isFinite(hit.distanceKm) ? Math.round(hit.distanceKm * 10) / 10 : 0;

    if (!input.seen.seenNew.has(hit.id)) {
      const silent = withinCentreTypeSilence(input.seen.lastNotifiedAt.get(silenceKey(hit.id, "new_centre")), input.nowMs);
      if (!silent) {
        events.push({
          daycareId: hit.id,
          slug: hit.slug,
          name: hit.name,
          city: hit.city,
          kind: "new_centre",
          distanceKm: km,
          vacancyAt: hit.lastVacancyUpdatedAt ?? null,
          facilityType: type,
        });
      }
    }

    const vacancyAt = hit.lastVacancyUpdatedAt ?? null;
    if (vacancyAt && vacancyPingEligible(hit, input.nowMs)) {
      const prev = input.seen.seenVacancy.get(hit.id);
      const vacancyTs = Date.parse(vacancyAt);
      const isReconfirm =
        !input.baseline &&
        Number.isFinite(vacancyTs) &&
        vacancyTs > input.sinceMs &&
        vacancyAt !== prev;
      const silent = withinCentreTypeSilence(
        input.seen.lastNotifiedAt.get(silenceKey(hit.id, "vacancy_reconfirmed")),
        input.nowMs,
      );
      if (isReconfirm && !silent) {
        events.push({
          daycareId: hit.id,
          slug: hit.slug,
          name: hit.name,
          city: hit.city,
          kind: "vacancy_reconfirmed",
          distanceKm: km,
          vacancyAt,
          facilityType: type,
        });
      }
    }
  }
  return events;
}

export function shouldNotifySearchAlert(baseline: boolean, dryRun: boolean, eventCount: number): boolean {
  return !baseline && !dryRun && eventCount > 0;
}
