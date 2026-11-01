/**
 * Parent-owned child profile shared with the enrolled daycare.
 * Allergies and medical notes stay parent-edited. Pickup names are checked
 * at checkout. FEATURE_CHILD_PROFILE defaults off.
 */

import { clipText, wiringEnabled, wiringMode } from "./common.ts";

export const CHILD_PROFILE_FLAG = "FEATURE_CHILD_PROFILE";

export function childProfileEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(CHILD_PROFILE_FLAG, env);
}

export function childProfileMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(CHILD_PROFILE_FLAG, env, dry);
}

export type CarePerson = { name: string; phone: string; relationship: string };

export function parseCarePeople(raw: unknown, limit = 6): CarePerson[] | { error: "people" } {
  if (!Array.isArray(raw)) return { error: "people" };
  const people: CarePerson[] = [];
  for (const item of raw.slice(0, limit)) {
    if (!item || typeof item !== "object") return { error: "people" };
    const row = item as Record<string, unknown>;
    const name = clipText(row.name, 80);
    const phone = clipText(row.phone, 20);
    const relationship = clipText(row.relationship, 40);
    if (!name) return { error: "people" };
    people.push({ name, phone, relationship });
  }
  return people;
}

export function daycareMaySeeProfile(input: { enrolled: boolean; shared: boolean }): boolean {
  return input.enrolled && input.shared;
}

export function personKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Checkout: the person at the door must be on the parent's list. */
export function pickupAllowed(name: string, people: readonly CarePerson[]): { ok: true } | { ok: false; reason: "empty" | "not_authorized" } {
  const key = personKey(name);
  if (!key) return { ok: false, reason: "empty" };
  if (!people.some((person) => personKey(person.name) === key)) return { ok: false, reason: "not_authorized" };
  return { ok: true };
}

export function profileChangeAudience(editor: "parent" | "provider"): "provider" | "parent" {
  return editor === "parent" ? "provider" : "parent";
}
