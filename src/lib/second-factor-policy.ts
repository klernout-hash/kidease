/** 14 days from the first health-note visit. Existing staff keep access until then. */
export const PROVIDER_HEALTH_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export type HealthFactorDecision = {
  redact: boolean;
  prompt: boolean;
  graceEndsAt: number | null;
};

/**
 * Parents are optional until they turn the email code on.
 * Provider staff who can see health notes or documents are prompted, then required.
 */
export function healthFactorDecision(input: {
  audience: "parent" | "provider";
  seesHealth: boolean;
  optedIn: boolean;
  verified: boolean;
  now: number;
  graceStartedAt: number | null;
}): HealthFactorDecision {
  if (input.verified) return { redact: false, prompt: false, graceEndsAt: null };
  if (input.audience === "parent") {
    return input.optedIn
      ? { redact: true, prompt: true, graceEndsAt: null }
      : { redact: false, prompt: false, graceEndsAt: null };
  }
  if (!input.seesHealth) return { redact: false, prompt: false, graceEndsAt: null };
  const started = input.graceStartedAt ?? input.now;
  const graceEndsAt = started + PROVIDER_HEALTH_GRACE_MS;
  if (input.now < graceEndsAt) return { redact: false, prompt: true, graceEndsAt };
  return { redact: true, prompt: true, graceEndsAt };
}

const HEALTH_TEXT = [
  "allergies",
  "medicalNotes",
  "medical_notes",
  "medications",
  "doctorName",
  "doctor_name",
  "doctorPhone",
  "doctor_phone",
  "emergencyName",
  "emergency_name",
  "emergencyPhone",
  "emergency_phone",
  "notes",
  "immunizationNote",
  "immunization_note",
] as const;

/** Hide note text already loaded for the screen. Names and birthdays stay. */
export function hideHealthText<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const row = { ...(value as Record<string, unknown>) };
  for (const key of HEALTH_TEXT) {
    if (key in row && (typeof row[key] === "string" || row[key] == null)) row[key] = "";
  }
  if (row.child && typeof row.child === "object") row.child = hideHealthText(row.child);
  return row as T;
}
