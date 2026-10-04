/**
 * Canadian Childcare Vacancy Index.
 * Counts come from public KidEase listings. No government census figures.
 */

import { PROVINCES } from "./geo.ts";

export const VACANCY_INDEX_PATH = "/vacancy-index";

export const AGE_BANDS = ["infant", "toddler", "preschool"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

const BAND_RANGE: Record<AgeBand, { min: number; max: number }> = {
  infant: { min: 0, max: 18 },
  toddler: { min: 18, max: 36 },
  preschool: { min: 36, max: 156 },
};

export type VacancyListingRow = {
  province: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  spotsInfant: number | null;
  spotsToddler: number | null;
  spotsPreschool: number | null;
  infantMonthly: number | null;
  toddlerMonthly: number | null;
  preschoolMonthly: number | null;
};

export type AgeCell = {
  centres: number;
  openSpots: number;
  averageFee: number | null;
};

export type ProvinceVacancy = {
  code: string;
  nameEn: string;
  nameFr: string;
  ages: Record<AgeBand, AgeCell>;
};

export type VacancyIndex = {
  monthKey: string;
  provinces: ProvinceVacancy[];
  centresWithAges: number;
};

export function overlapsAge(minMonths: number, maxMonths: number, band: AgeBand): boolean {
  const min = Number(minMonths);
  const max = Number(maxMonths);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return false;
  const range = BAND_RANGE[band];
  return min < range.max && max > range.min;
}

export function provinceCodeOf(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (PROVINCES.some((p) => p.code === upper)) return upper;
  const named = PROVINCES.find(
    (p) => p.name.toLowerCase() === text.toLowerCase() || p.nameFr.toLowerCase() === text.toLowerCase(),
  );
  return named?.code ?? null;
}

function emptyCell(): AgeCell {
  return { centres: 0, openSpots: 0, averageFee: null };
}

function spotsFor(row: VacancyListingRow, band: AgeBand): number {
  const raw = band === "infant" ? row.spotsInfant : band === "toddler" ? row.spotsToddler : row.spotsPreschool;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function feeFor(row: VacancyListingRow, band: AgeBand): number | null {
  const raw = band === "infant" ? row.infantMonthly : band === "toddler" ? row.toddlerMonthly : row.preschoolMonthly;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function buildVacancyIndex(rows: readonly VacancyListingRow[], now = new Date()): VacancyIndex {
  const buckets = new Map<string, Record<AgeBand, { centres: number; spots: number; feeSum: number; feeCount: number }>>();
  for (const province of PROVINCES) {
    buckets.set(province.code, {
      infant: { centres: 0, spots: 0, feeSum: 0, feeCount: 0 },
      toddler: { centres: 0, spots: 0, feeSum: 0, feeCount: 0 },
      preschool: { centres: 0, spots: 0, feeSum: 0, feeCount: 0 },
    });
  }

  let centresWithAges = 0;
  for (const row of rows) {
    const code = provinceCodeOf(row.province);
    if (!code) continue;
    const bucket = buckets.get(code);
    if (!bucket) continue;
    let counted = false;
    for (const band of AGE_BANDS) {
      if (!overlapsAge(row.ageMinMonths, row.ageMaxMonths, band)) continue;
      counted = true;
      const cell = bucket[band];
      cell.centres += 1;
      cell.spots += spotsFor(row, band);
      const fee = feeFor(row, band);
      if (fee != null) {
        cell.feeSum += fee;
        cell.feeCount += 1;
      }
    }
    if (counted) centresWithAges += 1;
  }

  const provinces: ProvinceVacancy[] = PROVINCES.map((province) => {
    const bucket = buckets.get(province.code)!;
    const ages = {} as Record<AgeBand, AgeCell>;
    for (const band of AGE_BANDS) {
      const cell = bucket[band];
      ages[band] = {
        centres: cell.centres,
        openSpots: cell.spots,
        averageFee: cell.feeCount > 0 ? Math.round(cell.feeSum / cell.feeCount) : null,
      };
    }
    return { code: province.code, nameEn: province.name, nameFr: province.nameFr, ages };
  });

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { monthKey, provinces, centresWithAges };
}

export function vacancyIndexJsonLd(index: VacancyIndex, locale: string): string {
  const fr = locale === "fr";
  const payload = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: fr ? "Indice canadien des places en garde" : "Canadian Childcare Vacancy Index",
    description: fr
      ? "Comptes en direct des garderies publiques KidEase, des places ouvertes et des frais mensuels, par province et groupe d'âge."
      : "Live counts of public KidEase listings, open spots, and monthly fees, by province and age group.",
    url: fr ? "https://www.kidease.ca/fr/vacancy-index" : "https://www.kidease.ca/vacancy-index",
    creator: { "@type": "Organization", name: "KidEase", url: "https://www.kidease.ca" },
    temporalCoverage: index.monthKey,
    spatialCoverage: { "@type": "Place", name: "Canada" },
    variableMeasured: ["centres", "open spots", "average monthly fee"],
    isBasedOn: "https://www.kidease.ca",
  };
  return JSON.stringify(payload);
}
