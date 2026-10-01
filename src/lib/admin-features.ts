/**
 * Allow-list for the admin Features page.
 * Only these keys can be read or changed from KidEase. The personal API key never leaves the server.
 */

export const POSTHOG_PROJECT_ID = "594559";
export const POSTHOG_APP_HOST = "https://us.posthog.com";

export const FEATURE_ROLLOUTS = [0, 10, 25, 50, 100] as const;
export type FeatureRollout = (typeof FEATURE_ROLLOUTS)[number];

export type FeatureSwitch = {
  key: string;
  name: string;
  description: string;
  /** False only when no KidEase code reads the flag. */
  built: boolean;
  /** Kill all AI skips search-only flags. */
  ai: boolean;
};

export const FEATURE_SWITCHES: readonly FeatureSwitch[] = [
  {
    key: "smart-match",
    name: "Find my match",
    description: "A parent answers a few questions and sees centres that fit.",
    built: true,
    ai: true,
  },
  {
    key: "ai-listing-writer",
    name: "Write it for me",
    description: "A daycare can rewrite its own notes. Nothing goes live until they save.",
    built: true,
    ai: true,
  },
  {
    key: "ranking-best-match",
    name: "Best match search",
    description: "Search can sort by fit instead of distance.",
    built: true,
    ai: false,
  },
  {
    key: "ai-photo-check",
    name: "Photo check",
    description: "Looks at a photo before it is saved. A person still decides.",
    built: true,
    ai: true,
  },
  {
    key: "spot-alerts",
    name: "Spot alerts",
    description: "A parent can hear when a saved search has a new opening.",
    built: true,
    ai: true,
  },
  {
    key: "ai-reply-drafts",
    name: "Reply drafts",
    description: "Writes a draft reply for a daycare. It is not sent until they send it.",
    built: true,
    ai: true,
  },
  {
    key: "parent-helper",
    name: "Parent helper",
    description: "Answers questions in the help bubble. It does not invent fees or openings.",
    built: true,
    ai: true,
  },
  {
    key: "ai-translate",
    name: "Translate",
    description: "Offers a draft in the other language. The saved listing stays as it is.",
    built: true,
    ai: true,
  },
  {
    key: "ai-review-summary",
    name: "Review summary",
    description: "Shortens published parent reviews. It does not invent stars.",
    built: true,
    ai: true,
  },
  {
    key: "ai-truth-checker",
    name: "Listing changes",
    description: "Compares the website on file and waits for an admin to approve.",
    built: true,
    ai: true,
  },
  {
    key: "ai-licence-reader",
    name: "Licence read",
    description: "Pulls a licence number, holder, and expiry for a person to confirm.",
    built: true,
    ai: true,
  },
  {
    key: "ai-spam-filter",
    name: "Spam and fraud",
    description: "Scores signups, messages, and reviews so an admin can look.",
    built: true,
    ai: true,
  },
  {
    key: "ai-support-triage",
    name: "Support drafts",
    description: "Tags a support note and writes a draft. It does not send the draft.",
    built: true,
    ai: true,
  },
  {
    key: "ai-demand-map",
    name: "Demand by city and age",
    description: "Shows searches next to openings on the demand page.",
    built: true,
    ai: true,
  },
];

const ALLOWED = new Set(FEATURE_SWITCHES.map((row) => row.key));

export function isAllowedFeatureKey(key: string): boolean {
  return ALLOWED.has(key);
}

export function aiFeatureKeys(): string[] {
  return FEATURE_SWITCHES.filter((row) => row.ai).map((row) => row.key);
}

export function personalApiKey(env: Record<string, string | undefined>): string | null {
  const key = String(env.POSTHOG_PERSONAL_API_KEY || "").trim();
  return key || null;
}

export function featureFlagsUrl(): string {
  return `${POSTHOG_APP_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?limit=200`;
}

export function featureFlagUrl(id: number | string): string {
  return `${POSTHOG_APP_HOST}/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/${id}/`;
}

export function featureQueryUrl(): string {
  return `${POSTHOG_APP_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`;
}

export function normalizeFeatureWrite(rollout: number): { active: boolean; rollout: FeatureRollout } | null {
  if (!FEATURE_ROLLOUTS.includes(rollout as FeatureRollout)) return null;
  if (rollout === 0) return { active: false, rollout: 0 };
  return { active: true, rollout: rollout as FeatureRollout };
}

export function featureFlagWriteBody(input: { active: boolean; rollout: number }): {
  active: boolean;
  filters: { groups: Array<{ properties: []; rollout_percentage: number }> };
} {
  const rollout = input.active ? Math.min(100, Math.max(0, Math.round(input.rollout))) : 0;
  return {
    active: input.active && rollout > 0,
    filters: { groups: [{ properties: [], rollout_percentage: rollout }] },
  };
}

export type FeatureLive = { active: boolean; rollout: number; updatedAt: string | null; inPostHog: boolean; id: number | null };

export function statusFromFlag(flag: {
  id?: number;
  active?: boolean;
  updated_at?: string | null;
  created_at?: string | null;
  filters?: { groups?: Array<{ rollout_percentage?: number | null }> };
} | null): FeatureLive {
  if (!flag) return { active: false, rollout: 0, updatedAt: null, inPostHog: false, id: null };
  const updatedAt = flag.updated_at || flag.created_at || null;
  const id = typeof flag.id === "number" ? flag.id : null;
  if (flag.active !== true) return { active: false, rollout: 0, updatedAt, inPostHog: true, id };
  const raw = Number(flag.filters?.groups?.[0]?.rollout_percentage ?? 100);
  const rollout = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : 100;
  if (rollout <= 0) return { active: false, rollout: 0, updatedAt, inPostHog: true, id };
  return { active: true, rollout, updatedAt, inPostHog: true, id };
}

export function featureStatusKind(live: { active: boolean; rollout: number; known: boolean }): "unknown" | "off" | "everyone" | "percent" {
  if (!live.known) return "unknown";
  if (!live.active || live.rollout <= 0) return "off";
  if (live.rollout >= 100) return "everyone";
  return "percent";
}

export function parseFlagStats(body: unknown): Record<string, { calls: number; trues: number }> {
  const out: Record<string, { calls: number; trues: number }> = {};
  if (!body || typeof body !== "object") return out;
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return out;
  for (const row of results) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const key = String(row[0] || "");
    if (!isAllowedFeatureKey(key)) continue;
    out[key] = { calls: Number(row[1]) || 0, trues: Number(row[2]) || 0 };
  }
  return out;
}

export function flagStatsQuery(): { kind: "HogQLQuery"; query: string } {
  const keys = FEATURE_SWITCHES.map((row) => `'${row.key}'`).join(", ");
  return {
    kind: "HogQLQuery",
    query: `select properties.$feature_flag as flag, count() as calls, countIf(toString(properties.$feature_flag_response) = 'true') as trues from events where event = '$feature_flag_called' and timestamp > now() - interval 1 day and properties.$feature_flag in (${keys}) group by flag`,
  };
}

export function allowFeatureWrite(prior: number[], now: number, limit = 8, windowMs = 60_000): boolean {
  return prior.filter((stamp) => now - stamp < windowMs).length < limit;
}

export function auditValue(input: { active: boolean; rollout: number }): string {
  if (!input.active || input.rollout <= 0) return "off";
  if (input.rollout >= 100) return "on:100";
  return `on:${input.rollout}`;
}

export function responseLeaksKey(body: unknown, secret: string | null): boolean {
  if (!secret) return false;
  return JSON.stringify(body).includes(secret);
}
