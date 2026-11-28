/** 14 days from the first health-note visit. Existing staff keep access until then. */
export const PROVIDER_HEALTH_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export type HealthFactorDecision = {
  redact: boolean;
  prompt: boolean;
  graceEndsAt: number | null;
  /** N-25: the lock day ("YYYY-MM-DD", HEALTH_DEADLINE_TIME_ZONE). Show this, not graceEndsAt. */
  graceEndsDay: string | null;
};

/**
 * N-25: the deadline is one calendar day for everyone who reads it, on any
 * phone or computer. The server rounds the end of the grace period up to the
 * next midnight in this zone and sends that day as "YYYY-MM-DD". Screens show
 * that day as is, never re-reading the instant in the device's own zone.
 */
export const HEALTH_DEADLINE_TIME_ZONE = "America/Toronto";

function zoneDay(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Milliseconds the zone is ahead of UTC at this instant. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant local midnight starts on this "YYYY-MM-DD" day in the zone. */
function zoneMidnight(day: string, timeZone: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let at = guess - zoneOffset(guess, timeZone);
  // A daylight-saving change between the guess and midnight moves the offset.
  at = guess - zoneOffset(at, timeZone);
  return at;
}

/**
 * End of the provider grace period: 14 days after it started, rounded up to
 * the next local midnight. Locks at the start of `day`, so "before {day}" is true.
 */
export function providerGraceDeadline(
  graceStartedAt: number,
  timeZone: string = HEALTH_DEADLINE_TIME_ZONE,
): { endsAt: number; day: string } {
  const raw = graceStartedAt + PROVIDER_HEALTH_GRACE_MS;
  const rawDay = zoneDay(raw, timeZone);
  const [y, m, d] = rawDay.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const day = next.toISOString().slice(0, 10);
  return { endsAt: zoneMidnight(day, timeZone), day };
}

/** "YYYY-MM-DD" from the server, shown the same on every device. */
export function formatDeadlineDay(day: string | null | undefined, locale: string): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
  const none = { graceEndsAt: null, graceEndsDay: null };
  if (input.verified) return { redact: false, prompt: false, ...none };
  if (input.audience === "parent") {
    return input.optedIn ? { redact: true, prompt: true, ...none } : { redact: false, prompt: false, ...none };
  }
  if (!input.seesHealth) return { redact: false, prompt: false, ...none };
  const started = input.graceStartedAt ?? input.now;
  const deadline = providerGraceDeadline(started);
  const ends = { graceEndsAt: deadline.endsAt, graceEndsDay: deadline.day };
  if (input.now < deadline.endsAt) return { redact: false, prompt: true, ...ends };
  return { redact: true, prompt: true, ...ends };
}

/**
 * N-25: "Hide" folds the email-code banner into one short line on this
 * device, for the signed-in person (the key is cleared at sign-out, see
 * account-scoped-storage.ts). The folded line keeps the deadline and the
 * "Add an email code" link, so the step is never out of reach. A new
 * deadline opens the full banner again.
 */
export const HEALTH_BANNER_HIDDEN_KEY = "ke.healthCodeBanner.hiddenFor";

export type HealthBannerMode = "none" | "full" | "folded";

/**
 * Never once the code is set (no prompt). Once health notes are locked, the
 * full banner always shows: the person needs the code to see them.
 */
export function healthBannerMode(input: {
  prompt: boolean;
  locked: boolean;
  deadlineDay: string | null;
  hiddenFor: string | null;
}): HealthBannerMode {
  if (!input.prompt) return "none";
  if (input.locked || !input.deadlineDay) return "full";
  return input.hiddenFor === input.deadlineDay ? "folded" : "full";
}

/** Whether the full banner offers "Hide". Locked notes need the code, so no. */
export function healthBannerCanHide(input: { prompt: boolean; locked: boolean; deadlineDay: string | null }): boolean {
  return input.prompt && !input.locked && Boolean(input.deadlineDay);
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
