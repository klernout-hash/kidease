/**
 * Pure rules for saved-listing, document, still-looking, and claim alerts.
 * scripts/alert-hooks.test.mjs loads this in Node. No database.
 */

export type ListingWatchFacts = {
  infantMonthly: number;
  toddlerMonthly: number;
  preschoolMonthly: number;
  partTimeMonthly: number;
  ageMinMonths: number;
  ageMaxMonths: number;
  hours: string;
  scheduleKey: string;
};

export function scheduleWatchKey(raw: unknown): string {
  if (Array.isArray(raw)) return [...raw].map((part) => String(part).trim()).filter(Boolean).sort().join(",");
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return "";
    try {
      return scheduleWatchKey(JSON.parse(text) as unknown);
    } catch {
      return text;
    }
  }
  return "";
}

function money(value: number): number {
  const n = Math.round(Number(value) || 0);
  return n > 0 ? n : 0;
}

export function normalizeListingWatch(input: ListingWatchFacts): ListingWatchFacts {
  return {
    infantMonthly: money(input.infantMonthly),
    toddlerMonthly: money(input.toddlerMonthly),
    preschoolMonthly: money(input.preschoolMonthly),
    partTimeMonthly: money(input.partTimeMonthly),
    ageMinMonths: Math.max(0, Math.round(Number(input.ageMinMonths) || 0)),
    ageMaxMonths: Math.max(0, Math.round(Number(input.ageMaxMonths) || 0)),
    hours: input.hours.replace(/\s+/g, " ").trim(),
    scheduleKey: scheduleWatchKey(input.scheduleKey),
  };
}

export function listingWatchChanged(before: ListingWatchFacts, after: ListingWatchFacts): boolean {
  const a = normalizeListingWatch(before);
  const b = normalizeListingWatch(after);
  return (
    a.infantMonthly !== b.infantMonthly ||
    a.toddlerMonthly !== b.toddlerMonthly ||
    a.preschoolMonthly !== b.preschoolMonthly ||
    a.partTimeMonthly !== b.partTimeMonthly ||
    a.ageMinMonths !== b.ageMinMonths ||
    a.ageMaxMonths !== b.ageMaxMonths ||
    a.hours !== b.hours ||
    a.scheduleKey !== b.scheduleKey
  );
}

export function savedListingDedupe(daycareId: string, after: ListingWatchFacts, day: string): string {
  const facts = normalizeListingWatch(after);
  const sig = [
    facts.infantMonthly,
    facts.toddlerMonthly,
    facts.preschoolMonthly,
    facts.partTimeMonthly,
    facts.ageMinMonths,
    facts.ageMaxMonths,
    facts.hours,
    facts.scheduleKey,
  ].join("|");
  return `saved:${daycareId}:${day}:${sig}`.slice(0, 180);
}

/** True when the expiry date is inside the next 30 days, or up to 7 days past. */
export function documentExpiryDue(expiresOn: string, now: Date, windowDays = 30): boolean {
  const day = String(expiresOn || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const exp = Date.parse(`${day}T18:00:00Z`);
  if (!Number.isFinite(exp)) return false;
  const start = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const end = now.getTime() + windowDays * 24 * 60 * 60 * 1000;
  return exp >= start && exp <= end;
}

export function licenceStatusWorthTelling(before: string | null | undefined, after: string | null | undefined): boolean {
  const next = String(after || "").trim().toLowerCase();
  const prev = String(before || "").trim().toLowerCase();
  if (!next || next === prev) return false;
  return true;
}

export function claimNeedsDocument(decision: string): boolean {
  return decision === "needs_docs";
}

export function stillLookingDue(input: {
  hasWatch: boolean;
  looking: boolean | null;
  confirmedAt: Date | null;
  nudgedAt: Date | null;
  now: Date;
}): boolean {
  if (!input.hasWatch) return false;
  if (input.looking === false) return false;
  const week = 7 * 24 * 60 * 60 * 1000;
  if (input.confirmedAt && input.now.getTime() - input.confirmedAt.getTime() < week) return false;
  if (input.nudgedAt && input.now.getTime() - input.nudgedAt.getTime() < week) return false;
  return true;
}

export function alertWeekKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = parts.split("-").map((part) => Number(part));
  const utc = Date.UTC(year || 1970, (month || 1) - 1, day || 1);
  return String(Math.floor(utc / (7 * 24 * 60 * 60 * 1000)));
}

export function winnipegDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
