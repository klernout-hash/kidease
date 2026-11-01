/**
 * Daycare edits to capacity, hours, address, or director wait for the
 * province government desk. The public listing changes only after approval.
 * Address text is stored as typed. No map geocoder runs here.
 */

import { clipText, governmentSeesProvince, wiringEnabled, wiringMode } from "./common.ts";

export const CHANGE_REQUEST_FLAG = "FEATURE_CHANGE_REQUESTS";
export const CHANGE_FIELDS = ["capacity", "hours", "address", "director"] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export function changeRequestsEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(CHANGE_REQUEST_FLAG, env);
}

export function changeRequestsMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(CHANGE_REQUEST_FLAG, env, dry);
}

export function parseChangeValue(field: string, raw: unknown): { ok: true; field: ChangeField; value: string } | { ok: false; error: "field" | "value" } {
  if (!(CHANGE_FIELDS as readonly string[]).includes(field)) return { ok: false, error: "field" };
  const key = field as ChangeField;
  if (key === "capacity") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 500) return { ok: false, error: "value" };
    return { ok: true, field: key, value: String(n) };
  }
  const text = clipText(raw, key === "hours" ? 200 : 160);
  if (text.length < 2) return { ok: false, error: "value" };
  return { ok: true, field: key, value: text };
}

export function reviewChange(input: {
  decision: "approve" | "decline";
  actorProvince: string;
  recordProvince: string;
  writable: boolean;
}): { ok: true; decision: "approve" | "decline" } | { ok: false; error: "province" | "read_only" } {
  if (!governmentSeesProvince({ actorProvince: input.actorProvince, recordProvince: input.recordProvince })) {
    return { ok: false, error: "province" };
  }
  if (!input.writable) return { ok: false, error: "read_only" };
  return { ok: true, decision: input.decision };
}

/** Approved address text does not move the map pin. */
export function listingPatch(field: ChangeField, value: string): Record<string, string | number> {
  if (field === "capacity") return { licensed_capacity: Number(value) };
  if (field === "hours") return { hours: value, hours_fr: value };
  if (field === "address") return { address: value };
  return { director_name: value };
}
