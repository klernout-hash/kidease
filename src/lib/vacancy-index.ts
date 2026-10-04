/**
 * Public-directory vacancy index. Centre counts and confirmed open spots only.
 * Relative imports so Node tests can load this file.
 * Never invent a fee, a rating, or an opening.
 */

import { clipAgeBand, PUBLIC_AGE_BANDS, type PublicAgeBand } from "./public-programs.ts";
import { jurisdiction, JURISDICTIONS } from "./province-registry.ts";

/** One centre, one age. Above this, the number is not treated as an opening. */
export const VACANCY_SPOT_CAP = 500;

export type VacancySourceRow = {
  province?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  /** False means the stored range must not be used. */
  agesKnown?: boolean | null;
  spotsInfant?: number | null;
  spotsToddler?: number | null;
  spotsPreschool?: number | null;
  vacancyConfirmed?: boolean | null;
};

export type VacancyBandCount = {
  band: PublicAgeBand;
  centres: number;
  /** Null when no centre in this cell confirmed spots, or the band has no spot column. */
  openSpots: number | null;
  confirmedCentres: number;
  /** School-age has no spot column on a listing. */
  spotsTracked: boolean;
};

export type ProvinceVacancy = {
  code: string;
  centres: number;
  agesUnknown: number;
  bands: VacancyBandCount[];
};

export type VacancyIndex = {
  countedOn: string;
  totalCentres: number;
  unplaced: number;
  provinces: ProvinceVacancy[];
};

const SPOT_KEY: Record<PublicAgeBand, "spotsInfant" | "spotsToddler" | "spotsPreschool" | null> = {
  infant: "spotsInfant",
  toddler: "spotsToddler",
  preschool: "spotsPreschool",
  "school-age": null,
};

export function provinceCodeOf(raw: string | null | undefined): string {
  const found = jurisdiction(raw);
  if (found) return found.code;
  const code = String(raw || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

export function usableAgeRange(row: VacancySourceRow): { min: number; max: number } | null {
  if (row.agesKnown === false) return null;
  const min = Number(row.ageMinMonths);
  const max = Number(row.ageMaxMonths);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min) || !(max > 0)) return null;
  return { min, max };
}

/** A stored spot count. Null when missing, negative, or above the cap. */
export function boundedSpots(value: number | null | undefined): number | null {
  if (value == null || value === ("" as unknown)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > VACANCY_SPOT_CAP) return null;
  return Math.round(n);
}

export function vacancyConfirmed(input: {
  lastVacancyUpdatedAt?: string | Date | null;
  spotsUpdatedAt?: string | Date | null;
  availabilityKnown?: boolean | null;
}): boolean {
  if (input.availabilityKnown) return true;
  if (input.lastVacancyUpdatedAt) return true;
  if (input.spotsUpdatedAt) return true;
  return false;
}

type Bucket = {
  centres: number;
  agesUnknown: number;
  bands: Map<PublicAgeBand, { centres: number; openSpots: number; confirmedCentres: number }>;
};

function emptyBucket(): Bucket {
  const bands = new Map<PublicAgeBand, { centres: number; openSpots: number; confirmedCentres: number }>();
  for (const band of PUBLIC_AGE_BANDS) {
    bands.set(band, { centres: 0, openSpots: 0, confirmedCentres: 0 });
  }
  return { centres: 0, agesUnknown: 0, bands };
}

function finish(code: string, bucket: Bucket): ProvinceVacancy {
  return {
    code,
    centres: bucket.centres,
    agesUnknown: bucket.agesUnknown,
    bands: PUBLIC_AGE_BANDS.map((band) => {
      const cell = bucket.bands.get(band)!;
      const tracked = SPOT_KEY[band] != null;
      const openSpots = tracked && cell.confirmedCentres > 0 ? cell.openSpots : null;
      return {
        band,
        centres: cell.centres,
        openSpots,
        confirmedCentres: tracked ? cell.confirmedCentres : 0,
        spotsTracked: tracked,
      };
    }),
  };
}

export function buildVacancyIndex(rows: readonly VacancySourceRow[], countedOn: string): VacancyIndex {
  const byCode = new Map<string, Bucket>();
  let unplaced = 0;
  let totalCentres = 0;

  for (const row of rows) {
    totalCentres += 1;
    const code = provinceCodeOf(row.province);
    if (!JURISDICTIONS.some((item) => item.code === code)) {
      unplaced += 1;
      continue;
    }
    let bucket = byCode.get(code);
    if (!bucket) {
      bucket = emptyBucket();
      byCode.set(code, bucket);
    }
    bucket.centres += 1;
    const range = usableAgeRange(row);
    if (!range) {
      bucket.agesUnknown += 1;
      continue;
    }
    const confirmed = Boolean(row.vacancyConfirmed);
    let placed = false;
    for (const band of PUBLIC_AGE_BANDS) {
      if (!clipAgeBand(range.min, range.max, band)) continue;
      placed = true;
      const cell = bucket.bands.get(band)!;
      cell.centres += 1;
      const key = SPOT_KEY[band];
      if (!key || !confirmed) continue;
      const spots = boundedSpots(row[key]);
      if (spots == null) continue;
      cell.confirmedCentres += 1;
      cell.openSpots += spots;
    }
    if (!placed) bucket.agesUnknown += 1;
  }

  const provinces = JURISDICTIONS.map((item) => finish(item.code, byCode.get(item.code) ?? emptyBucket()));
  return { countedOn, totalCentres, unplaced, provinces };
}
