/**
 * After a centre claims a listing: photos, fees, ages, open spots.
 * A step is done only when that fact is on the listing. Missing stays open.
 */

export const CLAIM_PROGRESS_STEPS = ["photos", "fees", "ages", "spots"] as const;
export type ClaimProgressStepId = (typeof CLAIM_PROGRESS_STEPS)[number];

export type ClaimProgressInput = {
  photos?: readonly string[] | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  availabilityKnown?: boolean | null;
  lastVacancyUpdatedAt?: string | null;
  spotsUpdatedAt?: string | null;
};

export type ClaimProgressStep = {
  id: ClaimProgressStepId;
  done: boolean;
};

export type ClaimProgress = {
  steps: ClaimProgressStep[];
  done: number;
  total: number;
  complete: boolean;
};

function hasPhoto(photos?: readonly string[] | null) {
  return (photos || []).some((src) => {
    const value = (src || "").trim();
    if (!value) return false;
    if (value.includes("placeholder")) return false;
    if (value.includes("-logo")) return false;
    return true;
  });
}

function hasFee(input: ClaimProgressInput) {
  return [input.infantMonthly, input.toddlerMonthly, input.preschoolMonthly, input.partTimeMonthly].some(
    (n) => typeof n === "number" && n > 0,
  );
}

function hasAges(input: ClaimProgressInput) {
  if (input.agesKnown === false) return false;
  const min = Number(input.ageMinMonths);
  const max = Number(input.ageMaxMonths);
  if (input.agesKnown === true && max > min) return true;
  return max > min && max > 0;
}

function hasSpotsAnswer(input: ClaimProgressInput) {
  if (input.availabilityKnown === true) return true;
  const stamp = input.lastVacancyUpdatedAt || input.spotsUpdatedAt;
  return Boolean(stamp && String(stamp).trim());
}

export function claimProgress(input: ClaimProgressInput): ClaimProgress {
  const steps: ClaimProgressStep[] = [
    { id: "photos", done: hasPhoto(input.photos) },
    { id: "fees", done: hasFee(input) },
    { id: "ages", done: hasAges(input) },
    { id: "spots", done: hasSpotsAnswer(input) },
  ];
  const done = steps.filter((step) => step.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
