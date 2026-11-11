/**
 * Phase 1 search rules: licence type, several children, vacancy freshness, fee display.
 * Unknown licence is never guessed. Fees are never invented.
 */
import { holdAlert, type HoldReason } from "./phase1-gate.ts";
import { standardGroupForAgeMonths, type StandardAgeGroupId } from "./standard-age-groups.ts";
import { dayKeyInTimeZone } from "./family-time.ts";

export const LICENCE_BUCKETS = ["centre", "home", "unknown"] as const;
export type LicenceBucket = (typeof LICENCE_BUCKETS)[number];

export const LICENCE_LABELS: Record<LicenceBucket, { en: string; fr: string }> = {
  centre: { en: "Licensed centre", fr: "Centre permis" },
  home: { en: "Licensed home", fr: "Milieu familial permis" },
  unknown: { en: "Licence type not listed", fr: "Type de permis non indiqué" },
};

/** Map a stored value. Anything we cannot place stays unknown. */
export function licenceBucket(raw: string | null | undefined): LicenceBucket {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || value === "unknown") return "unknown";
  if (/(home|family|milieu|familial|agency home)/.test(value)) return "home";
  if (/(centre|center|facility|garderie)/.test(value)) return "centre";
  return "unknown";
}

export function licenceMatches(stored: string | null | undefined, selected: LicenceBucket): boolean {
  const bucket = licenceBucket(stored);
  if (selected === "unknown") return bucket === "unknown";
  if (bucket === "unknown") return false;
  return bucket === selected;
}

export type SiblingDiscount = { type: "percent" | "fixed" | "none" | "unknown"; amount: number | null };

export function showSiblingDiscount(discount: SiblingDiscount | null): string | null {
  if (!discount || discount.type === "unknown" || discount.type === "none") return null;
  if (discount.type === "percent" && discount.amount != null) return `${discount.amount}%`;
  if (discount.type === "fixed" && discount.amount != null) return `$${discount.amount}`;
  return null;
}

export function multiChildMatch(
  centreBands: readonly string[],
  childAgesMonths: readonly number[],
): "full" | "partial" | "none" {
  const offered = new Set(centreBands);
  const bands = childAgesMonths.map((months) => standardGroupForAgeMonths(months)).filter((band): band is StandardAgeGroupId => band != null);
  if (!bands.length) return "none";
  const hits = bands.filter((band) => offered.has(band)).length;
  if (hits === bands.length) return "full";
  if (hits > 0) return "partial";
  return "none";
}

export function countBucketLabel(count: number): "1" | "2" | "3+" {
  if (count <= 1) return "1";
  if (count === 2) return "2";
  return "3+";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function vacancyIsStale(input: {
  confirmedAt: string | null;
  now: Date;
  timeZone: string;
  windowDays: number;
}): boolean {
  if (!input.confirmedAt) return true;
  const confirmed = Date.parse(input.confirmedAt);
  if (!Number.isFinite(confirmed)) return true;
  const today = dayKeyInTimeZone(input.now, input.timeZone);
  const confirmedDay = dayKeyInTimeZone(new Date(confirmed), input.timeZone);
  const start = Date.parse(`${confirmedDay}T00:00:00.000Z`);
  const end = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  const days = Math.round((end - start) / DAY_MS);
  return days > input.windowDays;
}

export function vacancyReminder(input: {
  flagOn: boolean;
  enabledAt: string | null;
  confirmedAt: string | null;
  now: Date;
  timeZone: string;
  windowDays: number;
  alreadySent: boolean;
  quiet: boolean;
}): { deliver: false; reason: HoldReason | "not_due" | "already_stale" } {
  if (!input.confirmedAt) return { deliver: false, reason: "already_stale" };
  const confirmed = Date.parse(input.confirmedAt);
  if (!Number.isFinite(confirmed)) return { deliver: false, reason: "already_stale" };
  const staleAt = confirmed + input.windowDays * DAY_MS;
  const remindAt = staleAt - 3 * DAY_MS;
  if (input.now.getTime() >= staleAt) return { deliver: false, reason: "already_stale" };
  if (input.now.getTime() < remindAt) return { deliver: false, reason: "not_due" };
  const held = holdAlert({
    flagOn: input.flagOn,
    enabledAt: input.enabledAt,
    occurredAt: new Date(remindAt).toISOString(),
    alreadySent: input.alreadySent,
    quiet: input.quiet,
    needsCasl: false,
    caslOk: true,
  });
  return held;
}

export type FeeDisplay = "centre" | "official" | "hidden";

export function feeDisplayState(input: {
  claimed: boolean;
  centreConfirmedAt: string | null;
  officialAsOf: string | null;
  now: Date;
}): FeeDisplay {
  if (input.claimed && input.centreConfirmedAt && Number.isFinite(Date.parse(input.centreConfirmedAt))) return "centre";
  if (input.officialAsOf) {
    const asOf = Date.parse(input.officialAsOf);
    if (Number.isFinite(asOf) && input.now.getTime() - asOf <= 366 * DAY_MS) return "official";
  }
  return "hidden";
}

export const FEE_HIDDEN_COPY = {
  en: "Fees are not confirmed yet.",
  fr: "Les tarifs ne sont pas encore confirmés.",
} as const;
