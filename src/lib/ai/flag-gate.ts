/**
 * Decide whether an AI feature is visible.
 * A PostHog answer wins. The built-in 50% split is only for when PostHog
 * cannot be reached. A reached response with the flag off stays hidden.
 * Best match ranking is read in the same request, but it is not an AI feature
 * and does not use that 50% split.
 */

import { RANKING_BEST_MATCH_FLAG } from "../ranking/weights.ts";
import { AI_FLAGS, aiFlagDefaultOn, type AiFlag } from "./flags.ts";

export const AI_REMOTE_FLAGS = [
  AI_FLAGS.smartMatch,
  AI_FLAGS.listingWriter,
  AI_FLAGS.photoCheck,
  AI_FLAGS.spotAlerts,
  AI_FLAGS.replyDrafts,
] as const;

/** Keys this server read asks PostHog to evaluate. Callers must not add their own. */
export const SERVER_FLAG_KEYS = [...AI_REMOTE_FLAGS, RANKING_BEST_MATCH_FLAG] as const;

export type AiFlagSnapshot = {
  reached: boolean;
  flags: Partial<Record<string, boolean>>;
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
export function parseAiFlagSnapshot(body: unknown, keys: readonly string[]): AiFlagSnapshot {
  if (!body || typeof body !== "object") return { reached: false, flags: {} };
  const rec = body as Record<string, unknown>;
  const flags: Partial<Record<string, boolean>> = {};
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
