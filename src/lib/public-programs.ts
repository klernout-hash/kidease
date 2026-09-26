/**
 * Public program rows. Part-time is never an age band.
 * A band renders only when it extends past the younger band and the
 * clipped span has a positive width. Relative imports so Node tests can load this file.
 */

import { confirmedStoredFeeProgram, hasListedMonthlyFees } from "./fee-program.ts";
import { localeTag } from "./languages.ts";
import type { Locale } from "./types.ts";

export const PUBLIC_AGE_BANDS = ["infant", "toddler", "preschool", "school-age"] as const;
export type PublicAgeBand = (typeof PUBLIC_AGE_BANDS)[number];

/** Canonical spans. Neighbours overlap; display uses the younger band's max as the fence. */
export const PUBLIC_BAND_RANGE: Record<PublicAgeBand, { min: number; max: number }> = {
  infant: { min: 0, max: 18 },
  toddler: { min: 18, max: 36 },
  preschool: { min: 30, max: 72 },
  "school-age": { min: 60, max: 144 },
};

/**
 * A centre that stops at this age still belongs to the younger band.
 * Preschool ends at 72 months, so a 72-month max is not school-age.
 * Toddler ends at 36 months, so a 36-month max is not preschool.
 */
const YOUNGER_BAND_MAX: Record<PublicAgeBand, number | null> = {
  infant: null,
  toddler: 18,
  preschool: 36,
  "school-age": 72,
};

export type GeneratedAgeBand = {
  band: PublicAgeBand;
  ageMinMonths: number;
  ageMaxMonths: number;
  monthlyFee: number | null;
};

function positiveFee(value: number | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * Clip a band to the centre's confirmed range.
 * Zero-width edges (72–72) and ranges that never pass the younger band are dropped.
 */
export function clipAgeBand(
  centreMin: number,
  centreMax: number,
  band: PublicAgeBand,
): { min: number; max: number } | null {
  const min = Number(centreMin);
  const max = Number(centreMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
  const youngerMax = YOUNGER_BAND_MAX[band];
  if (youngerMax != null && max <= youngerMax) return null;
  const range = PUBLIC_BAND_RANGE[band];
  const lo = Math.max(min, range.min);
  const hi = Math.min(max, range.max);
  if (!(hi > lo)) return null;
  return { min: lo, max: hi };
}

/**
 * Age-band rows from the monthly columns. `partTimeMonthly` is intentionally
 * not an argument — it is not a school-age fee.
 */
export function generatedAgeBands(d: {
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
}): GeneratedAgeBand[] {
  const fees: Record<PublicAgeBand, number | null> = {
    infant: positiveFee(d.infantMonthly),
    toddler: positiveFee(d.toddlerMonthly),
    preschool: positiveFee(d.preschoolMonthly),
    "school-age": null,
  };
  const rows: GeneratedAgeBand[] = [];
  for (const band of PUBLIC_AGE_BANDS) {
    const clip = clipAgeBand(Number(d.ageMinMonths), Number(d.ageMaxMonths), band);
    if (!clip) continue;
    const monthlyFee = fees[band];
    if (monthlyFee == null && !(clip.max > clip.min)) continue;
    rows.push({
      band,
      ageMinMonths: clip.min,
      ageMaxMonths: clip.max,
      monthlyFee,
    });
  }
  return rows;
}

/** Part-time / half-day monthly amount. Null when the column is empty. */
export function partTimeMonthlyFee(value: number | null | undefined): number | null {
  return positiveFee(value);
}

export function monthlyFeeVisible(
  amount: number | null,
  d: { feeConfirmed?: boolean | null; live?: boolean | null },
): boolean {
  return Boolean((d.feeConfirmed || d.live) && amount && amount > 0);
}

/** CAD monthly amount with an explicit unit. */
export function formatMonthlyFee(cad: number, locale: Locale = "en"): string {
  const formatted = new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(cad);
  return `${formatted}${locale === "fr" ? "/mois" : "/month"}`;
}

export type FeeSourceKind = "website" | "public";

export function feeSourceKind(factSource?: string | null): FeeSourceKind | null {
  const source = String(factSource ?? "").trim();
  if (!source) return null;
  if (/https?:\/\/|www\.|\.(ca|com|org|net)\b/i.test(source)) return "website";
  return "public";
}

export type ListingFeeNotes = {
  priceList: boolean;
  mb10: boolean;
  source: FeeSourceKind | null;
  unconfirmed: boolean;
};

/**
 * One fee message. Known monthly amounts do not also say fees are confirmed
 * after claim. Manitoba $10-a-day stays a single explanation.
 */
export function listingFeeNotes(d: {
  live?: boolean | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  feeProgram?: string | null;
  province?: string | null;
  factSource?: string | null;
}): ListingFeeNotes {
  const mb10 = confirmedStoredFeeProgram(d) === "mb-10-day";
  const listed = hasListedMonthlyFees(d);
  if (mb10) {
    return { priceList: false, mb10: true, source: null, unconfirmed: false };
  }
  if (d.live && listed) {
    return { priceList: true, mb10: false, source: null, unconfirmed: false };
  }
  if (listed) {
    return { priceList: false, mb10: false, source: feeSourceKind(d.factSource), unconfirmed: false };
  }
  return { priceList: false, mb10: false, source: null, unconfirmed: true };
}
