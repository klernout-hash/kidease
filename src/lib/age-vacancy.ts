/**
 * City x age vacancy pages. A page exists only when at least 5 public
 * listings in that city have a real age range that overlaps the group.
 * Fees and spots come from those rows. Missing fees are left out.
 */

export const AGE_VACANCY_GROUPS = ["infant", "toddler", "preschool"] as const;
export type AgeVacancyGroup = (typeof AGE_VACANCY_GROUPS)[number];
export const AGE_VACANCY_MIN_LISTINGS = 5;
export const AGE_VACANCY_LIST_CAP = 40;
export const AGE_VACANCY_SITEMAP_PATH = "/sitemap-age-vacancy.xml";

export type AgeVacancyInput = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  spotsInfant?: number | null;
  spotsToddler?: number | null;
  spotsPreschool?: number | null;
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
};

export type AgeVacancyListing = {
  id: string;
  slug: string;
  name: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  spots: number;
  fee: number | null;
};

export type AgeVacancyPage = {
  citySlug: string;
  city: string;
  province: string;
  age: AgeVacancyGroup;
  centres: number;
  openSpots: number;
  averageFee: number | null;
  listings: AgeVacancyListing[];
};

export function isAgeVacancyGroup(value: string | null | undefined): value is AgeVacancyGroup {
  return value === "infant" || value === "toddler" || value === "preschool";
}

export function cityAgeSlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function listingServesAge(
  minMonths: number | null | undefined,
  maxMonths: number | null | undefined,
  age: AgeVacancyGroup,
): boolean {
  if (minMonths == null || maxMonths == null) return false;
  if (!Number.isFinite(minMonths) || !Number.isFinite(maxMonths)) return false;
  const lo = Math.min(minMonths, maxMonths);
  const hi = Math.max(minMonths, maxMonths);
  if (age === "infant") return lo < 18 && hi >= 0;
  if (age === "toddler") return lo < 36 && hi >= 18;
  return hi >= 36;
}

function spotsFor(row: AgeVacancyInput, age: AgeVacancyGroup): number {
  const raw = age === "infant" ? row.spotsInfant : age === "toddler" ? row.spotsToddler : row.spotsPreschool;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function feeFor(row: AgeVacancyInput, age: AgeVacancyGroup): number | null {
  const raw = age === "infant" ? row.infantMonthly : age === "toddler" ? row.toddlerMonthly : row.preschoolMonthly;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function buildAgeVacancyPages(rows: readonly AgeVacancyInput[]): AgeVacancyPage[] {
  const groups = new Map<string, { city: string; province: string; age: AgeVacancyGroup; rows: AgeVacancyInput[] }>();
  for (const row of rows) {
    const city = String(row.city || "").trim();
    const province = String(row.province || "").trim();
    const slug = cityAgeSlug(city);
    if (!slug || !province) continue;
    for (const age of AGE_VACANCY_GROUPS) {
      if (!listingServesAge(row.ageMinMonths, row.ageMaxMonths, age)) continue;
      const key = `${province}|${slug}|${age}`;
      const bucket = groups.get(key) ?? { city, province, age, rows: [] };
      bucket.rows.push(row);
      groups.set(key, bucket);
    }
  }
  const pages: AgeVacancyPage[] = [];
  for (const bucket of groups.values()) {
    if (bucket.rows.length < AGE_VACANCY_MIN_LISTINGS) continue;
    const fees = bucket.rows.map((row) => feeFor(row, bucket.age)).filter((n): n is number => n != null);
    const listings = bucket.rows
      .flatMap((row) => {
        const slug = String(row.slug || "").trim();
        const name = String(row.name || "").trim();
        const ageMinMonths = Number(row.ageMinMonths);
        const ageMaxMonths = Number(row.ageMaxMonths);
        if (!slug || !name || !Number.isFinite(ageMinMonths) || !Number.isFinite(ageMaxMonths)) return [];
        return [{
          id: String(row.id || slug),
          slug,
          name,
          ageMinMonths,
          ageMaxMonths,
          spots: spotsFor(row, bucket.age),
          fee: feeFor(row, bucket.age),
        }];
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, AGE_VACANCY_LIST_CAP);
    pages.push({
      citySlug: cityAgeSlug(bucket.city),
      city: bucket.city,
      province: bucket.province,
      age: bucket.age,
      centres: bucket.rows.length,
      openSpots: bucket.rows.reduce((sum, row) => sum + spotsFor(row, bucket.age), 0),
      averageFee: fees.length ? Math.round(fees.reduce((sum, n) => sum + n, 0) / fees.length) : null,
      listings,
    });
  }
  return pages.sort((a, b) => a.province.localeCompare(b.province) || a.city.localeCompare(b.city) || a.age.localeCompare(b.age));
}

export function ageVacancyPath(citySlug: string, age: AgeVacancyGroup): string {
  return `/daycare/${citySlug}/${age}`;
}

export function ageVacancySitemapPaths(rows: readonly AgeVacancyInput[]): string[] {
  return buildAgeVacancyPages(rows).map((page) => ageVacancyPath(page.citySlug, page.age));
}

export function renderAgeVacancySitemapXml(paths: readonly string[], origin = "https://www.kidease.ca"): string {
  const body = paths
    .map((path) => {
      const loc = `${origin}${path}`.replace(/&/g, "&amp;");
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
