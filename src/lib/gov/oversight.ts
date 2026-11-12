/**
 * Regulator view on top of the public licensed counts.
 * Scores stay off unless FEATURE_GOV_OVERSIGHT is exactly 1.
 * Missing inspection data never becomes a low risk score.
 * scripts/gov-oversight.test.mjs loads this file.
 */

export type OversightState = "public" | "agreement" | "off";

export type OversightItem = {
  id: string;
  state: OversightState;
  en: string;
  fr: string;
};

export const OVERSIGHT_ITEMS: readonly OversightItem[] = [
  { id: "licensed", state: "public", en: "Licensed centres and spaces from the public register", fr: "Centres et places permis du registre public" },
  { id: "open-spots", state: "public", en: "Open spots only when a centre has reported them", fr: "Places ouvertes seulement si un centre les a déclarées" },
  { id: "expiry", state: "agreement", en: "Licence expiry dates", fr: "Dates d’expiration des permis" },
  { id: "inspections", state: "agreement", en: "Inspection schedule and overdue list", fr: "Calendrier d’inspection et retards" },
  { id: "enforcement", state: "agreement", en: "Orders, conditions, and penalties", fr: "Ordres, conditions et pénalités" },
  { id: "occurrences", state: "agreement", en: "Serious occurrence reports from the province", fr: "Événements graves transmis par la province" },
  { id: "screening", state: "agreement", en: "Staff screening expiry dates", fr: "Dates d’expiration des vérifications du personnel" },
  { id: "risk", state: "off", en: "Facility risk score", fr: "Pointage de risque du centre" },
  { id: "planner", state: "off", en: "Space planner and 1 to 5 year forecast", fr: "Plan des places et prévision de 1 à 5 ans" },
];

export function govOversightEnabled(env: { FEATURE_GOV_OVERSIGHT?: string | null } = {}): boolean {
  const raw = env.FEATURE_GOV_OVERSIGHT ?? (typeof process !== "undefined" ? process.env.FEATURE_GOV_OVERSIGHT : "");
  return String(raw || "").trim() === "1";
}

/** Children per licensed space. A desert is 3 or more. Missing numbers stay blank. */
export function accessNeed(input: { spaces: number | null; children: number | null }): {
  childrenPerSpace: number | null;
  desert: boolean | null;
} {
  if (input.spaces == null || input.children == null || input.spaces <= 0 || input.children < 0) {
    return { childrenPerSpace: null, desert: null };
  }
  const ratio = Math.round((input.children / input.spaces) * 10) / 10;
  return { childrenPerSpace: ratio, desert: ratio >= 3 };
}

export type RiskResult =
  | { blocked: true; reason: "flag_off" | "no_agreement" }
  | { blocked: false; score: number; tier: 1 | 2 | 3 | 4; reasons: string[] };

const WEIGHTS = {
  compliance: 25,
  enforcement: 15,
  occurrences: 15,
  complaints: 10,
  overdue: 10,
  documents: 10,
  staffing: 10,
  exposure: 5,
} as const;

/** Missing factors raise the score. The flag and at least one provincial factor are required. */
export function facilityRisk(input: {
  enabled: boolean;
  factors: Partial<Record<keyof typeof WEIGHTS, number | null>>;
}): RiskResult {
  if (!input.enabled) return { blocked: true, reason: "flag_off" };
  const entries = Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>;
  const provided = entries.filter(([key]) => input.factors[key] != null);
  if (provided.length === 0) return { blocked: true, reason: "no_agreement" };
  let score = 0;
  const reasons: string[] = [];
  for (const [key, weight] of entries) {
    const raw = input.factors[key];
    const value = raw == null ? 1 : Math.min(1, Math.max(0, raw));
    score += weight * value;
    if (raw == null) reasons.push(`${key}: missing, counted as high`);
    else if (value > 0) reasons.push(`${key}: ${value}`);
  }
  const rounded = Math.round(score);
  const tier: 1 | 2 | 3 | 4 = rounded >= 75 ? 4 : rounded >= 50 ? 3 : rounded >= 25 ? 2 : 1;
  return { blocked: false, score: rounded, tier, reasons };
}
