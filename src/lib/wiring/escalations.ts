/**
 * Unresolved items escalate to admin after a stored number of hours.
 * No default clock is invented. FEATURE_ESCALATIONS defaults off.
 * Status is visible to the roles on the item.
 */

import { wiringEnabled, wiringMode } from "./common.ts";

export const ESCALATION_FLAG = "FEATURE_ESCALATIONS";
export const ESCALATION_ROLES = ["parent", "provider", "admin", "government"] as const;
export type EscalationRole = (typeof ESCALATION_ROLES)[number];

export function escalationsEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(ESCALATION_FLAG, env);
}

export function escalationsMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(ESCALATION_FLAG, env, dry);
}

export function parseSlaHours(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 24 * 30) return null;
  return n;
}

export function escalationDue(input: {
  openedAt: string;
  slaHours: number | null;
  now: string;
  resolved: boolean;
}): boolean {
  if (input.resolved || input.slaHours == null) return false;
  const opened = Date.parse(input.openedAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(opened) || !Number.isFinite(now)) return false;
  return now - opened >= input.slaHours * 60 * 60 * 1000;
}

export function escalationVisible(input: { role: string; parties: readonly string[]; userId: string; isParty: boolean }): boolean {
  if (input.role === "admin") return true;
  return input.isParty;
}
