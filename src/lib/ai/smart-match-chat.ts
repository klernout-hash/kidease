/**
 * Find my match chat. Five questions, then the existing search filters.
 * The model still only sees an optional note. Place and start date stay here.
 */

import type { SmartMatchAge, SmartMatchBudget, SmartMatchQuiz } from "./smart-match.ts";

export const MATCH_STEP_IDS = ["age", "place", "start", "schedule", "priorities"] as const;
export type MatchStepId = (typeof MATCH_STEP_IDS)[number];

export const MATCH_RADIUS = [5, 10, 25] as const;
export type MatchRadius = (typeof MATCH_RADIUS)[number];

export type MatchStartChoice = "soon" | "next-month" | "three-months" | "date";
export type MatchScheduleChoice = "full" | "part" | "weekdays";

export type MatchChatAnswers = {
  age: SmartMatchAge | null;
  place: string;
  radiusKm: MatchRadius | null;
  startChoice: MatchStartChoice | null;
  startDate: string;
  schedule: MatchScheduleChoice | null;
  budget: SmartMatchBudget | null;
  subsidy: boolean;
  french: boolean;
  extraSupport: boolean;
  prioritiesDone: boolean;
};

export const EMPTY_MATCH_ANSWERS: MatchChatAnswers = {
  age: null,
  place: "",
  radiusKm: null,
  startChoice: null,
  startDate: "",
  schedule: null,
  budget: null,
  subsidy: false,
  french: false,
  extraSupport: false,
  prioritiesDone: false,
};

export function currentMatchStep(answers: MatchChatAnswers): MatchStepId | "results" {
  if (!answers.age) return "age";
  if (!answers.place.trim() || !answers.radiusKm) return "place";
  if (!answers.startChoice) return "start";
  if (answers.startChoice === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(answers.startDate)) return "start";
  if (!answers.schedule) return "schedule";
  if (!answers.prioritiesDone) return "priorities";
  return "results";
}

export function rewindMatchAnswers(answers: MatchChatAnswers): MatchChatAnswers {
  const step = currentMatchStep(answers);
  if (step === "results") {
    return { ...answers, prioritiesDone: false, budget: null, subsidy: false, french: false, extraSupport: false };
  }
  if (step === "priorities") return { ...answers, schedule: null, prioritiesDone: false };
  if (step === "schedule") return { ...answers, startChoice: null, startDate: "" };
  if (step === "start") return { ...answers, place: "", radiusKm: null };
  if (step === "place") {
    if (answers.place.trim() || answers.radiusKm) return { ...answers, place: "", radiusKm: null };
    return { ...answers, age: null };
  }
  return { ...EMPTY_MATCH_ANSWERS };
}

export function parseAgeText(text: string): SmartMatchAge | null {
  const q = text.toLowerCase();
  if (/\binfant|\bbaby|\bb[eé]b[eé]|\bnewborn\b/.test(q)) return "infant";
  if (/\btoddler|\bbambin\b|\b1\s*year|\b2\s*year|\b18\s*month/.test(q)) return "toddler";
  if (/\bpreschool|\bpre-school|\bpr[eé]scolaire|\bmaternelle|\b3\s*year|\b4\s*year/.test(q)) return "preschool";
  if (/\bschool[-\s]?age|\bscolaire|\bgrade\b|\b5\s*year|\b6\s*year|\b7\s*year/.test(q)) return "school-age";
  if (/\bany age|\bany\b|peu importe|n'importe|nimporte/.test(q)) return "any";
  return null;
}

export function parseRadiusKm(text: string): MatchRadius | null {
  const match = text.toLowerCase().match(/(\d{1,2})\s*(?:km|kilometre|kilometer|kilom[eè]tre)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  if (n <= 7) return 5;
  if (n <= 17) return 10;
  if (n <= 40) return 25;
  return null;
}

export function stripRadiusWords(text: string): string {
  return text
    .replace(/(\d{1,2})\s*(?:km|kilometres|kilometers|kilometre|kilometer|kilom[eè]tres)/gi, " ")
    .replace(/[·,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseScheduleText(text: string): MatchScheduleChoice | null {
  const q = text.toLowerCase();
  if (/weekday|week-day|week day|jours de semaine|en semaine|monday to friday|mon(?:day)?\s*[-–to]+\s*fri/.test(q)) {
    return "weekdays";
  }
  if (/part[-\s]?time|temps partiel|\bpart\b/.test(q)) return "part";
  if (/full[-\s]?time|temps plein|\bfull\b/.test(q)) return "full";
  return null;
}

export function parseStartText(text: string): { choice: MatchStartChoice; startDate: string } | null {
  const q = text.toLowerCase().trim();
  const iso = q.match(/\d{4}-\d{2}-\d{2}/);
  if (iso && isoDateValid(iso[0])) return { choice: "date", startDate: iso[0] };
  if (/as soon|d[eè]s que|right away|asap|soon/.test(q)) return { choice: "soon", startDate: "" };
  if (/3\s*month|trois mois|in three/.test(q)) return { choice: "three-months", startDate: "" };
  if (/next month|mois prochain|le mois prochain/.test(q)) return { choice: "next-month", startDate: "" };
  return null;
}

function isoDateValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function matchStartDate(answers: MatchChatAnswers, now = new Date()): string | null {
  if (answers.startChoice === "date") return isoDateValid(answers.startDate) ? answers.startDate : null;
  if (answers.startChoice === "soon") return isoDate(now);
  if (answers.startChoice === "next-month") return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  if (answers.startChoice === "three-months") return isoDate(new Date(now.getFullYear(), now.getMonth() + 3, 1));
  return null;
}

export type PriorityFlags = {
  budget: SmartMatchBudget | null;
  subsidy: boolean;
  french: boolean;
  extraSupport: boolean;
};

export function parsePriorityText(text: string): PriorityFlags | null {
  const q = text.toLowerCase();
  const flags: PriorityFlags = { budget: null, subsidy: false, french: false, extraSupport: false };
  let hit = false;
  if (/\$?\s*10|ten a day|10-a-day|10 a day/.test(q)) {
    flags.budget = "ten";
    hit = true;
  }
  if (/subsid|subvention/.test(q)) {
    flags.subsidy = true;
    hit = true;
  }
  if (/french|fran[cç]ais/.test(q)) {
    flags.french = true;
    hit = true;
  }
  if (/support|inclusi/.test(q)) {
    flags.extraSupport = true;
    hit = true;
  }
  if (/\bany\b|peu importe|no preference|doesn't matter|does not matter/.test(q)) {
    flags.budget = flags.budget || "any";
    hit = true;
  }
  return hit ? flags : null;
}

export function answersToQuiz(answers: MatchChatAnswers): SmartMatchQuiz {
  return {
    age: answers.age ?? "any",
    budget: answers.budget === "ten" ? "ten" : "any",
    french: answers.french,
    fullTime: answers.schedule === "full" || answers.schedule === "weekdays",
    partTime: answers.schedule === "part",
    extraSupport: answers.extraSupport,
    note: "",
  };
}

export function wantsSubsidy(answers: MatchChatAnswers): boolean {
  return answers.budget === "ten" || answers.subsidy;
}
