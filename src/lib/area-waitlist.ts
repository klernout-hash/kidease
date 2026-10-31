/**
 * Area waitlist matching. Pure: no database and no mail send.
 * A parent picks a postal code or city, a radius, an age group, and an optional
 * start date. A posted spot matches only when distance, age, and start date fit.
 * Coordinates come from the saved search or the listing. Nothing here invents a pin.
 * Email stays off until FEATURE_AREA_WAITLIST_ALERTS. This file does not read that flag.
 */

import { haversineKm } from "./geo.ts";
import {
  OPEN_SPOT_DAILY_CAP,
  spotMatchesWatch,
  type PostedSpot,
  type SpotAgeBand,
  type SpotSearchWatch,
} from "./spot-alert-match.ts";
import { winnipegDayKey } from "./search-alert-policy.ts";

export const AREA_WAITLIST_KIND = "waitlist_area";
export const AREA_WAITLIST_CAP = 5;
export const AREA_WAITLIST_RADII = [5, 10, 15, 25, 40] as const;

const AGE_EN: Record<string, string> = {
  any: "Any age",
  infant: "Infant",
  toddler: "Toddler",
  preschool: "Preschool",
  "school-age": "School age",
};

const AGE_FR: Record<string, string> = {
  any: "Tout âge",
  infant: "Poupon",
  toddler: "Tout-petit",
  preschool: "Préscolaire",
  "school-age": "Âge scolaire",
};

export type AreaWaitlistWatch = {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  radiusKm: number;
  ageBand: SpotAgeBand;
  startDate: string | null;
  /** Vacancies at or before this time are already known. Null means not baselined. */
  checkedAt: string | null;
  label: string;
};

export type AreaWaitlistSpot = PostedSpot & {
  slug: string;
  name: string;
  city: string;
  vacancyAt: string | null;
};

export type AreaWaitlistPrior = {
  userId: string;
  daycareId: string;
  spotKey: string;
  day: string;
};

export type AreaWaitlistHit = {
  watchId: string;
  userId: string;
  daycareId: string;
  slug: string;
  name: string;
  city: string;
  distanceKm: number;
  ageBand: string;
  label: string;
  spotKey: string;
};

export function normalizeCanadianPostal(raw: string | null | undefined): string | null {
  const compact = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(compact)) return null;
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export function areaPlaceQuery(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/** One alert per parent, per centre, per vacancy day and spot count. */
export function areaSpotKey(
  vacancyAt: string | null | undefined,
  counts: { infant: number; toddler: number; preschool: number },
  now: Date = new Date(),
): string {
  const parsed = Date.parse(String(vacancyAt || ""));
  const day = Number.isFinite(parsed) ? winnipegDayKey(new Date(parsed)) : winnipegDayKey(now);
  const infant = Math.max(0, Math.round(counts.infant) || 0);
  const toddler = Math.max(0, Math.round(counts.toddler) || 0);
  const preschool = Math.max(0, Math.round(counts.preschool) || 0);
  return `${day}:${infant}:${toddler}:${preschool}`;
}

export function vacancyIsNewer(vacancyAt: string | null | undefined, checkedAt: string | null | undefined): boolean {
  const vacancy = Date.parse(String(vacancyAt || ""));
  const checked = Date.parse(String(checkedAt || ""));
  if (!Number.isFinite(vacancy) || !Number.isFinite(checked)) return false;
  return vacancy > checked;
}

function watchAsSpot(watch: AreaWaitlistWatch): SpotSearchWatch {
  return {
    id: watch.id,
    parentId: watch.userId,
    ageBand: watch.ageBand,
    childAgeMonths: null,
    city: null,
    lat: watch.lat,
    lng: watch.lng,
    radiusKm: watch.radiusKm,
    startDate: watch.startDate,
    digest: false,
  };
}

export function planAreaWaitlistHits(input: {
  watches: AreaWaitlistWatch[];
  spots: AreaWaitlistSpot[];
  prior: AreaWaitlistPrior[];
  now?: Date;
}): AreaWaitlistHit[] {
  const now = input.now ?? new Date();
  const today = winnipegDayKey(now);
  const seen = new Set<string>();
  const sentToday = new Map<string, number>();
  for (const row of input.prior) {
    if (!row.userId || !row.daycareId || !row.spotKey) continue;
    seen.add(`${row.userId}:${row.daycareId}:${row.spotKey}`);
    if (row.day === today) sentToday.set(row.userId, (sentToday.get(row.userId) ?? 0) + 1);
  }
  const hits: AreaWaitlistHit[] = [];
  for (const watch of input.watches) {
    if (!watch.userId || !Number.isFinite(watch.lat) || !Number.isFinite(watch.lng)) continue;
    for (const spot of input.spots) {
      if (!spot.listingId || !vacancyIsNewer(spot.vacancyAt, watch.checkedAt)) continue;
      if (!spotMatchesWatch(watchAsSpot(watch), spot, now)) continue;
      const spotKey = areaSpotKey(spot.vacancyAt, {
        infant: spot.spotsInfant,
        toddler: spot.spotsToddler,
        preschool: spot.spotsPreschool,
      }, now);
      const key = `${watch.userId}:${spot.listingId}:${spotKey}`;
      if (seen.has(key)) continue;
      if ((sentToday.get(watch.userId) ?? 0) >= OPEN_SPOT_DAILY_CAP) continue;
      const distanceKm =
        Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
          ? Math.round(haversineKm({ lat: watch.lat, lng: watch.lng }, { lat: spot.lat as number, lng: spot.lng as number }) * 10) / 10
          : Number.isFinite(spot.distanceKm)
            ? Math.round((spot.distanceKm as number) * 10) / 10
            : 0;
      hits.push({
        watchId: watch.id,
        userId: watch.userId,
        daycareId: spot.listingId,
        slug: spot.slug,
        name: spot.name,
        city: spot.city,
        distanceKm,
        ageBand: watch.ageBand,
        label: watch.label,
        spotKey,
      });
      seen.add(key);
      sentToday.set(watch.userId, (sentToday.get(watch.userId) ?? 0) + 1);
    }
  }
  return hits;
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function areaAgeLabel(ageBand: string, locale: "en" | "fr"): string {
  const table = locale === "fr" ? AGE_FR : AGE_EN;
  return table[ageBand] || table.any || "Any age";
}

/**
 * Kyle approved this wording. The send path still waits for FEATURE_AREA_WAITLIST_ALERTS, which defaults off.
 */
export function areaWaitlistLetter(input: {
  locale: "en" | "fr";
  centre: string;
  city: string;
  place: string;
  km: number;
  ageBand: string;
  url: string;
  manageUrl: string;
}): { subject: string; text: string; html: string } {
  const centre = input.centre.replace(/\s+/g, " ").trim().slice(0, 80) || "A centre";
  const city = input.city.replace(/\s+/g, " ").trim().slice(0, 80);
  const place = input.place.replace(/\s+/g, " ").trim().slice(0, 80) || "your area";
  const km = Number.isFinite(input.km) ? input.km : 0;
  const age = areaAgeLabel(input.ageBand, input.locale);
  const url = input.url;
  const manage = input.manageUrl;
  if (input.locale === "fr") {
    const subject = `KidEase : une place pourrait être libre près de ${place}`;
    const text = [
      `KidEase a trouvé une place possiblement libre à ${centre}${city ? `, à ${city}` : ""}.`,
      `Elle est à environ ${km} km de ${place}.`,
      `Groupe d'âge : ${age}.`,
      "Ce n'est pas une place réservée. Demandez à la garderie si elle est encore libre.",
      `Ouvrir la fiche : ${url}`,
      `Gérer votre liste de secteur : ${manage}`,
    ].join("\n\n");
    const html = `<p>${esc(text.split("\n\n")[0] || "")}</p><p>${esc(`Elle est à environ ${km} km de ${place}.`)}</p><p>Groupe d'âge : ${esc(age)}.</p><p>Ce n'est pas une place réservée. Demandez à la garderie si elle est encore libre.</p><p><a href="${esc(url)}">Ouvrir la fiche</a></p><p><a href="${esc(manage)}">Gérer votre liste de secteur</a></p>`;
    return { subject, text, html };
  }
  const subject = `KidEase: a spot may be open near ${place}`;
  const text = [
    `KidEase found a possible open spot at ${centre}${city ? ` in ${city}` : ""}.`,
    `It is about ${km} km from ${place}.`,
    `Age group: ${age}.`,
    "This is not a reserved spot. Ask the centre if it is still open.",
    `Open the listing: ${url}`,
    `Manage your area waitlist: ${manage}`,
  ].join("\n\n");
  const html = `<p>${esc(`KidEase found a possible open spot at ${centre}${city ? ` in ${city}` : ""}.`)}</p><p>${esc(`It is about ${km} km from ${place}.`)}</p><p>Age group: ${esc(age)}.</p><p>This is not a reserved spot. Ask the centre if it is still open.</p><p><a href="${esc(url)}">Open the listing</a></p><p><a href="${esc(manage)}">Manage your area waitlist</a></p>`;
  return { subject, text, html };
}

export function areaWaitlistSms(input: { centre: string; city: string }): string {
  const centre = input.centre.replace(/\s+/g, " ").trim().slice(0, 60) || "a centre";
  const city = input.city.replace(/\s+/g, " ").trim().slice(0, 40);
  const where = city ? `${centre} in ${city}` : centre;
  return `KidEase: a spot may be open at ${where}. Open the listing in your account. Reply STOP to opt out.`;
}

/**
 * Area-waitlist texts are free. They still need FEATURE_SMS and stored CASL
 * SMS consent. Saved-search SMS stays on plus_plan=alerts.
 */
export function areaWaitlistSmsAllowed(input: { smsOn: boolean; caslConsent: boolean }): boolean {
  return input.smsOn === true && input.caslConsent === true;
}
