/**
 * PostHog-shaped A/B assignment for signup and search.
 * FEATURE_EXPERIMENTS defaults off, which returns "off" and records no exposure.
 * This file does not turn subscriptions on and does not change search ranking
 * until a caller opts in.
 */

export const EXPERIMENTS_FLAG = "FEATURE_EXPERIMENTS";

export const EXPERIMENTS = {
  signupHeadline: "exp-signup-headline",
  searchOrder: "exp-search-order",
} as const;

export type ExperimentKey = (typeof EXPERIMENTS)[keyof typeof EXPERIMENTS];
export type ExperimentVariant = "off" | "control" | "treatment";

/**
 * Insight ids from the KidEase PostHog project.
 * Empty until the insight exists. The queries are in docs/experiments.md.
 */
export const EXPERIMENT_INSIGHTS = {
  signupFunnel: "",
  searchFunnel: "",
  retentionCohort: "",
} as const;

export type ExperimentEnv = Record<string, string | undefined>;

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function experimentsEnabled(env?: ExperimentEnv): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[EXPERIMENTS_FLAG]) || flagOn(bag[`VITE_${EXPERIMENTS_FLAG}`]);
}

function hashUnit(distinctId: string, experiment: string): number {
  const text = `${experiment}:${distinctId}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33) ^ text.charCodeAt(i);
  return Math.abs(hash) % 100;
}

/** Stable 50/50 split. Off means do not log an exposure. */
export function assignVariant(input: {
  enabled: boolean;
  experiment: ExperimentKey;
  distinctId: string;
}): ExperimentVariant {
  if (!input.enabled) return "off";
  const id = input.distinctId.trim();
  if (!id) return "off";
  return hashUnit(id, input.experiment) < 50 ? "treatment" : "control";
}

export function signupHeadline(variant: ExperimentVariant, locale: "en" | "fr"): string {
  if (variant !== "treatment") {
    return locale === "fr" ? "Créez un compte parent" : "Create a parent account";
  }
  return locale === "fr" ? "Trouvez une garderie permise" : "Find licensed daycare";
}

/** Treatment sorts by name only as a measured alternative. Distance stays the default. */
export function searchOrder(variant: ExperimentVariant): "distance" | "name" {
  return variant === "treatment" ? "name" : "distance";
}

export const FUNNEL_STEPS = {
  signup: ["signup_viewed", "account_created"],
  search: ["search_viewed", "listing_opened", "tour_requested"],
} as const;

export const RETENTION_COHORT = {
  start: "account_created",
  returnEvent: "listing_opened",
  weeks: [1, 4],
} as const;

export function exposureEvent(input: {
  enabled: boolean;
  experiment: ExperimentKey;
  distinctId: string;
}): { event: "$feature_flag_called"; properties: Record<string, string> } | null {
  const variant = assignVariant(input);
  if (variant === "off") return null;
  return {
    event: "$feature_flag_called",
    properties: {
      $feature_flag: input.experiment,
      $feature_flag_response: variant,
    },
  };
}
