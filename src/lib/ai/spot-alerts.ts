/**
 * Spot alerts draft a notice from real open spots and real parent fits.
 * The model only rewrites that notice. It cannot invent a spot, a fee, or a family.
 * Nothing is sent until a daycare approves, and nothing goes out after 9 PM Winnipeg.
 */

import { z } from "zod";
import { isAlertQuietHours } from "../search-alert-policy.ts";

const AGE_BANDS = ["any", "infant", "toddler", "preschool", "school-age"] as const;
export type SpotAgeBand = (typeof AGE_BANDS)[number];

export type SpotCounts = { infant: number; toddler: number; preschool: number };

export const SPOT_ALERT_START_DAYS = 90;

export const spotAlertSchema = z
  .object({
    body: z.string().min(1).max(280),
  })
  .strict();

export type SpotAlertModel = z.infer<typeof spotAlertSchema>;

export type SpotAlertFacts = {
  name: string;
  city: string;
  infant: number;
  toddler: number;
  preschool: number;
  matched: number;
  age: number;
  start: number;
  distance: number;
};

export type SpotParentFact = {
  userId: string;
  ageBand: SpotAgeBand;
  startDate: string | null;
  /** Null means the parent is already on this listing, so distance is this centre. */
  distanceKm: number | null;
  radiusKm: number;
};

export type SpotFitSummary = {
  matched: number;
  age: number;
  start: number;
  distance: number;
  userIds: string[];
};

export const SPOT_ALERT_SYSTEM = [
  "Rewrite the alert in one or two short sentences.",
  "Use only the centre name, the city, and the numbers in the facts.",
  "Do not add a fee, a licence, a review, a parent, a child, or a spot count that is not in the facts.",
  "Reply with JSON only: {\"body\":\"...\"}.",
].join(" ");

export const SPOT_ALERT_EVENTS = [
  "spot_alert_drafted",
  "spot_alert_approved",
  "spot_alert_held_quiet",
  "spot_alert_fallback",
] as const;

export function spotAlertEventProps(input: { daycareId?: string; matched?: number } = {}) {
  const props: Record<string, string | number> = {};
  const id = String(input.daycareId || "").trim();
  if (id && !id.includes("@")) props.daycare_id = id;
  if (typeof input.matched === "number" && Number.isFinite(input.matched)) {
    props.matched = Math.max(0, Math.round(input.matched));
  }
  return props;
}

export function spotCounts(facts: Pick<SpotAlertFacts, "infant" | "toddler" | "preschool">): SpotCounts {
  return {
    infant: Math.max(0, Math.round(facts.infant) || 0),
    toddler: Math.max(0, Math.round(facts.toddler) || 0),
    preschool: Math.max(0, Math.round(facts.preschool) || 0),
  };
}

export function openSpotTotal(spots: SpotCounts): number {
  return spots.infant + spots.toddler + spots.preschool;
}

function ageBandsWithSpots(spots: SpotCounts): SpotAgeBand[] {
  const bands: SpotAgeBand[] = [];
  if (spots.infant > 0) bands.push("infant");
  if (spots.toddler > 0) bands.push("toddler");
  if (spots.preschool > 0) bands.push("preschool");
  return bands;
}

function ageMatches(ageBand: SpotAgeBand, open: SpotAgeBand[]): boolean {
  if (!open.length) return false;
  if (ageBand === "any") return true;
  return open.includes(ageBand);
}

export function ageFitsSpot(ageBand: SpotAgeBand, spots: SpotCounts): boolean {
  return ageMatches(ageBand, ageBandsWithSpots(spots));
}

/** A missing or unreadable start date is not a date we invent, so it does not block a fit. */
export function startDateFits(startDate: string | null | undefined, now: Date = new Date(), windowDays = SPOT_ALERT_START_DAYS): boolean {
  const raw = String(startDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  const ts = Date.parse(`${raw}T12:00:00Z`);
  if (!Number.isFinite(ts)) return true;
  const days = Math.round((ts - now.getTime()) / 86_400_000);
  return days <= windowDays;
}

export function distanceFitsSpot(distanceKm: number | null, radiusKm: number): boolean {
  if (distanceKm == null) return true;
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return false;
  const radius = Number.isFinite(radiusKm) ? Math.min(50, Math.max(1, Math.round(radiusKm))) : 25;
  return distanceKm <= radius;
}

export function parentFactFits(fact: SpotParentFact, spots: SpotCounts, now: Date = new Date()) {
  const age = ageFitsSpot(fact.ageBand, spots);
  const start = startDateFits(fact.startDate, now);
  const distance = distanceFitsSpot(fact.distanceKm, fact.radiusKm);
  return { age, start, distance, fit: age && start && distance };
}

export function summarizeSpotFits(facts: SpotParentFact[], spots: SpotCounts, now: Date = new Date()): SpotFitSummary {
  const byUser = new Map<string, { age: boolean; start: boolean; distance: boolean; fit: boolean }>();
  for (const fact of facts) {
    const id = fact.userId.trim();
    if (!id) continue;
    const row = parentFactFits(fact, spots, now);
    const prev = byUser.get(id);
    if (!prev) {
      byUser.set(id, row);
      continue;
    }
    byUser.set(id, {
      age: prev.age || row.age,
      start: prev.start || row.start,
      distance: prev.distance || row.distance,
      fit: prev.fit || row.fit,
    });
  }
  let age = 0;
  let start = 0;
  let distance = 0;
  const userIds: string[] = [];
  for (const [id, row] of byUser) {
    if (row.age) age += 1;
    if (row.start) start += 1;
    if (row.distance) distance += 1;
    if (row.fit) userIds.push(id);
  }
  return { matched: userIds.length, age, start, distance, userIds };
}

export function asAgeBand(raw: unknown): SpotAgeBand {
  return AGE_BANDS.includes(raw as SpotAgeBand) ? (raw as SpotAgeBand) : "any";
}

function cleanLabel(value: string, fallback: string): string {
  const text = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return text || fallback;
}

export function spotAlertFacts(input: {
  name: string;
  city: string;
  spots: SpotCounts;
  fit: Pick<SpotFitSummary, "matched" | "age" | "start" | "distance">;
}): SpotAlertFacts {
  return {
    name: cleanLabel(input.name, "A centre"),
    city: cleanLabel(input.city, ""),
    infant: input.spots.infant,
    toddler: input.spots.toddler,
    preschool: input.spots.preschool,
    matched: input.fit.matched,
    age: input.fit.age,
    start: input.fit.start,
    distance: input.fit.distance,
  };
}

function spotsLabel(spots: SpotCounts): string {
  const parts: string[] = [];
  if (spots.infant > 0) parts.push(`${spots.infant} infant`);
  if (spots.toddler > 0) parts.push(`${spots.toddler} toddler`);
  if (spots.preschool > 0) parts.push(`${spots.preschool} preschool`);
  if (!parts.length) return "an open spot";
  return parts.join(", ");
}

export function spotAlertTemplate(facts: SpotAlertFacts): string {
  const place = facts.city ? ` in ${facts.city}` : "";
  const spots = spotsLabel(spotCounts(facts));
  return `${facts.name}${place} posted ${spots}. ${facts.matched} families fit by age, start date, and distance.`;
}

export function spotAlertModelUser(facts: SpotAlertFacts): string {
  return JSON.stringify({
    centre: facts.name,
    city: facts.city,
    infant: facts.infant,
    toddler: facts.toddler,
    preschool: facts.preschool,
    matched: facts.matched,
    age: facts.age,
    start: facts.start,
    distance: facts.distance,
  });
}

function allowedNumbers(facts: SpotAlertFacts): Set<string> {
  const allowed = new Set<string>(["0"]);
  for (const n of [facts.infant, facts.toddler, facts.preschool, facts.matched, facts.age, facts.start, facts.distance]) {
    allowed.add(String(Math.max(0, Math.round(n) || 0)));
  }
  for (const n of `${facts.name} ${facts.city}`.match(/\d+/g) || []) allowed.add(n);
  return allowed;
}

export function groundSpotAlert(model: SpotAlertModel | null, facts: SpotAlertFacts): { body: string; source: "model" | "fallback" } {
  const template = spotAlertTemplate(facts);
  const body = model?.body.replace(/\s+/g, " ").trim() || "";
  if (!body || body.length > 280) return { body: template, source: "fallback" };
  if (/[@]/.test(body) || /\b(fee|fees|licence|license|review|\$)\b/i.test(body)) {
    return { body: template, source: "fallback" };
  }
  const nums = body.match(/\d+/g) || [];
  const allowed = allowedNumbers(facts);
  if (nums.some((n) => !allowed.has(n))) return { body: template, source: "fallback" };
  return { body, source: "model" };
}

/** After 9 PM Winnipeg, including the overnight hold used by other alerts. */
export function spotAlertQuiet(now: Date = new Date()): boolean {
  return isAlertQuietHours(now);
}
