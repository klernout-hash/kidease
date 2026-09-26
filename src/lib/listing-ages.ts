/**
 * Public age-range copy. Never invent 12–60 (editor default) when ages are unconfirmed.
 * Relative imports so Node tests can load this file.
 */

export type ListingAgeSource = {
  agesKnown?: boolean | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
};

export function listingAgesConfirmed(item: ListingAgeSource): boolean {
  if (item.agesKnown !== true) return false;
  const min = Number(item.ageMinMonths);
  const max = Number(item.ageMaxMonths);
  return Number.isFinite(min) && Number.isFinite(max) && max > min && max > 0;
}

type AgePoint = {
  unit: "month" | "year";
  /** Compact number or half-year token, without the unit word. */
  label: string;
  full: string;
  /** "2 years 3 months" cannot share a unit with the other side. */
  mixed: boolean;
};

function yearWord(count: number, locale: "en" | "fr"): string {
  if (locale === "fr") return count === 1 ? "an" : "ans";
  return count === 1 ? "year" : "years";
}

function monthWord(count: number, locale: "en" | "fr"): string {
  if (locale === "fr") return "mois";
  return count === 1 ? "month" : "months";
}

function formatAgePoint(months: number, locale: "en" | "fr"): AgePoint {
  const n = Math.max(0, Math.round(months));
  if (n < 24) {
    const word = monthWord(n, locale);
    return { unit: "month", label: String(n), full: `${n} ${word}`, mixed: false };
  }
  const years = Math.floor(n / 12);
  const rem = n % 12;
  if (rem === 0) {
    const word = yearWord(years, locale);
    return { unit: "year", label: String(years), full: `${years} ${word}`, mixed: false };
  }
  if (rem === 6) {
    const label = locale === "fr" ? `${years},5` : `${years}½`;
    const word = locale === "fr" ? "ans" : "years";
    return { unit: "year", label, full: `${label} ${word}`, mixed: false };
  }
  const full = `${years} ${yearWord(years, locale)} ${rem} ${monthWord(rem, locale)}`;
  return { unit: "year", label: full, full, mixed: true };
}

function rangeUnit(unit: "month" | "year", maxMonths: number, locale: "en" | "fr"): string {
  if (unit === "month") return monthWord(maxMonths, locale);
  const years = maxMonths / 12;
  return yearWord(years <= 1 ? 1 : 2, locale);
}

/**
 * Months under 2 years, years from 2 up. Same unit collapses to one word:
 * "3–18 months", "2½–6 years". Mixed units keep both: "6 months – 6 years".
 */
export function formatPublicAgeRange(min: number, max: number, locale: "en" | "fr" = "en"): string {
  const a = formatAgePoint(min, locale);
  const b = formatAgePoint(max, locale);
  if (a.unit === b.unit && !a.mixed && !b.mixed) {
    return `${a.label}\u2013${b.label} ${rangeUnit(b.unit, max, locale)}`;
  }
  return `${a.full} \u2013 ${b.full}`;
}

export function listingAgeRangeText(
  item: ListingAgeSource,
  _style: "short" | "months" = "short",
  locale: "en" | "fr" = "en",
): string {
  if (!listingAgesConfirmed(item)) return "";
  return formatPublicAgeRange(Number(item.ageMinMonths), Number(item.ageMaxMonths), locale);
}
