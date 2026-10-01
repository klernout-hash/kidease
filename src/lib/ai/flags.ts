/**
 * One PostHog flag per AI feature.
 * Parent and daycare features that shipped first roll out at 50% when PostHog has not answered.
 * Newer features and admin features stay off until the flag is explicitly on.
 */

export const AI_FLAGS = {
  smartMatch: "smart-match",
  listingWriter: "ai-listing-writer",
  photoCheck: "ai-photo-check",
  spotAlerts: "spot-alerts",
  replyDrafts: "ai-reply-drafts",
  parentHelper: "parent-helper",
  translate: "ai-translate",
  reviewSummary: "ai-review-summary",
  truthChecker: "ai-truth-checker",
  licenceReader: "ai-licence-reader",
  spamFilter: "ai-spam-filter",
  supportTriage: "ai-support-triage",
  demandMap: "ai-demand-map",
} as const;

export type AiFlag = (typeof AI_FLAGS)[keyof typeof AI_FLAGS];

const ADMIN_FLAGS = new Set<AiFlag>([
  AI_FLAGS.truthChecker,
  AI_FLAGS.licenceReader,
  AI_FLAGS.spamFilter,
  AI_FLAGS.supportTriage,
  AI_FLAGS.demandMap,
]);

/** New features stay off when PostHog has not answered. Smart match and the writer keep 50%. */
const FALLBACK_OFF = new Set<AiFlag>([AI_FLAGS.photoCheck]);

export function aiFlagRolloutPercent(flag: AiFlag): number {
  if (ADMIN_FLAGS.has(flag) || FALLBACK_OFF.has(flag)) return 0;
  return 50;
}

export function aiFlagDefaultOn(flag: AiFlag, bucket: number, remote?: boolean): boolean {
  if (remote === true) return true;
  if (remote === false) return false;
  return bucket < aiFlagRolloutPercent(flag);
}

export function aiBucket(id: string): number {
  let hash = 0;
  const key = id.trim() || "0";
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return hash % 100;
}
