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

export function listingAgeRangeText(
  item: ListingAgeSource,
  style: "short" | "months" = "short",
): string {
  if (!listingAgesConfirmed(item)) return "";
  const min = Number(item.ageMinMonths);
  const max = Number(item.ageMaxMonths);
  return style === "months" ? `${min}–${max} months` : `${min} m – ${max} m`;
}
