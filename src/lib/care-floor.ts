/**
 * Floor tools on the daycare care desk. Text and checks only.
 * scripts/care-floor.test.mjs loads this file.
 */

export const TOILET_KINDS = ["wet", "dry", "bm", "diaper"] as const;
export const HEALTH_CHECKS = ["fever", "rash", "cough", "vomiting"] as const;
export const EVENT_KINDS = ["allergen", "incident"] as const;

export type ToiletKind = (typeof TOILET_KINDS)[number];
export type HealthCheck = (typeof HEALTH_CHECKS)[number];
export type FloorEventKind = (typeof EVENT_KINDS)[number];

export type RollMark = { kind: "child" | "staff"; name: string; accounted: boolean };

export type OpenRoll = { id: string; marks: RollMark[]; closed: boolean };

export function cleanName(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function isToiletKind(value: unknown): value is ToiletKind {
  return (TOILET_KINDS as readonly string[]).includes(String(value || ""));
}

export function isFloorEventKind(value: unknown): value is FloorEventKind {
  return (EVENT_KINDS as readonly string[]).includes(String(value || ""));
}

export function markRoll(marks: readonly RollMark[], next: RollMark): RollMark[] {
  const name = cleanName(next.name);
  if (!name) return [...marks];
  const rest = marks.filter((row) => !(row.kind === next.kind && cleanName(row.name).toLowerCase() === name.toLowerCase()));
  return [...rest, { kind: next.kind, name, accounted: next.accounted === true }];
}

export function rollCanClose(marks: readonly RollMark[]): boolean {
  return marks.some((row) => row.accounted);
}

export function pickupMatches(typed: string, allowed: readonly string[]): string | null {
  const want = cleanName(typed).toLowerCase();
  if (!want) return null;
  const hit = allowed.map(cleanName).find((name) => name.toLowerCase() === want);
  return hit || null;
}

export function healthAnswers(input: unknown): Record<HealthCheck, boolean> | null {
  if (!input || typeof input !== "object") return null;
  const bag = input as Record<string, unknown>;
  const out = {} as Record<HealthCheck, boolean>;
  for (const key of HEALTH_CHECKS) {
    if (typeof bag[key] !== "boolean") return null;
    out[key] = bag[key];
  }
  return out;
}
