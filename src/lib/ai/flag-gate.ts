/**
 * Decide whether an AI feature is visible.
 * A PostHog answer wins. The built-in 50% split is only for when PostHog
 * cannot be reached. A reached response with the flag off stays hidden.
 */

import { AI_FLAGS, aiFlagDefaultOn, type AiFlag } from "./flags.ts";

export const AI_REMOTE_FLAGS = [AI_FLAGS.smartMatch, AI_FLAGS.listingWriter] as const;

export type AiFlagSnapshot = {
  reached: boolean;
  flags: Partial<Record<AiFlag, boolean>>;
};

export function sanitizeAiDistinctId(raw: unknown): string {
  const id = String(raw ?? "").trim();
  if (!id || id === "dev-user") return "kidease-server";
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(id)) return "kidease-server";
  return id;
}

export function aiFeatureVisible(input: { flag: AiFlag; bucket: number; snapshot: AiFlagSnapshot }): boolean {
  if (!input.snapshot.reached) return aiFlagDefaultOn(input.flag, input.bucket);
  const remote = input.snapshot.flags[input.flag];
  if (remote === true) return true;
  if (remote === false) return false;
  return false;
}

function readFlagValue(body: Record<string, unknown>, key: string): boolean | undefined {
  const detailed = body.flags;
  if (detailed && typeof detailed === "object") {
    const row = (detailed as Record<string, unknown>)[key];
    if (typeof row === "boolean") return row;
    if (row && typeof row === "object" && "enabled" in row) return (row as { enabled?: unknown }).enabled === true;
  }
  const simple = body.featureFlags;
  if (!simple || typeof simple !== "object" || !Object.prototype.hasOwnProperty.call(simple, key)) return undefined;
  const raw = (simple as Record<string, unknown>)[key];
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v || v === "false" || v === "0" || v === "off" || v === "no") return false;
  return true;
}

/** A successful PostHog payload. Missing keys count as off. A failed compute does not. */
export function parseAiFlagSnapshot(body: unknown, keys: readonly AiFlag[]): AiFlagSnapshot {
  if (!body || typeof body !== "object") return { reached: false, flags: {} };
  const rec = body as Record<string, unknown>;
  const flags: Partial<Record<AiFlag, boolean>> = {};
  for (const key of keys) {
    const value = readFlagValue(rec, key);
    if (typeof value === "boolean") flags[key] = value;
  }
  const quota = Array.isArray(rec.quotaLimited) ? rec.quotaLimited : [];
  if (rec.errorsWhileComputingFlags === true && Object.keys(flags).length === 0) {
    return { reached: false, flags: {} };
  }
  if (quota.length > 0 && Object.keys(flags).length === 0) return { reached: false, flags: {} };
  return { reached: true, flags };
}
