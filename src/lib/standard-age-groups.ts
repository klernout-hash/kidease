/**
 * One age scale for every province and territory.
 * Infant, toddler, and preschool are months. School-age is years.
 * A listing that crosses several groups gets each one.
 * A range that ends on the next group's start stays in the younger group.
 * Months 60–72 match no group. Missing ages stay blank.
 */

export const STANDARD_AGE_GROUP_IDS = ["infant", "toddler", "preschool", "school-age"] as const;
export type StandardAgeGroupId = (typeof STANDARD_AGE_GROUP_IDS)[number];

export type StandardAgeGroup = {
  id: StandardAgeGroupId;
  minMonths: number;
  maxMonths: number;
  en: string;
  fr: string;
};

export const STANDARD_AGE_GROUPS: readonly StandardAgeGroup[] = [
  { id: "infant", minMonths: 0, maxMonths: 18, en: "Infant: 0\u201318 months", fr: "Nourrisson : 0\u201318 mois" },
  { id: "toddler", minMonths: 18, maxMonths: 36, en: "Toddler: 18\u201336 months", fr: "Tout-petit : 18\u201336 mois" },
  { id: "preschool", minMonths: 36, maxMonths: 60, en: "Preschool: 36\u201360 months", fr: "Pr\u00e9scolaire : 36\u201360 mois" },
  { id: "school-age", minMonths: 72, maxMonths: 144, en: "School-age: 6\u201312 years", fr: "\u00c2ge scolaire : 6\u201312 ans" },
];

/** A centre that stops at this age still belongs to the younger group. */
export const STANDARD_YOUNGER_MAX: Record<StandardAgeGroupId, number | null> = {
  infant: null,
  toddler: 18,
  preschool: 36,
  "school-age": 72,
};

export const SOURCED_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;

const PROVINCE_ALIASES: Record<string, string> = {
  PEI: "PE",
  NF: "NL",
  NFL: "NL",
  NFLD: "NL",
  PQ: "QC",
};

const SOURCE_PREFIXES = [
  "licensing_groups+regulation",
  "licensing_stated_range",
  "registry_service_types_stated",
  "licensing_program_option+regulation",
  "website_stated",
  "registry_open_data+regulation",
];

type SourceCategory = { token: string; minMonths: number; maxMonths: number };

const STANDARD_SOURCE: SourceCategory[] = [
  { token: "infant", minMonths: 0, maxMonths: 18 },
  { token: "toddler", minMonths: 18, maxMonths: 36 },
  { token: "preschool", minMonths: 36, maxMonths: 60 },
  { token: "school-age", minMonths: 72, maxMonths: 144 },
];

/**
 * Official source categories, in months, from the sourced age file.
 * Groups are the standard spans those months overlap. A token whose
 * official span overlaps nothing (kindergarten 60–72) stays unmapped.
 * NT and NU have no sourced rows, so they have no invented ranges.
 */
export const PROVINCE_AGE_CATEGORIES: Record<string, readonly SourceCategory[]> = {
  AB: [
    { token: "infant", minMonths: 0, maxMonths: 19 },
    { token: "preschool", minMonths: 19, maxMonths: 72 },
    { token: "daycare", minMonths: 0, maxMonths: 72 },
    { token: "school-age", minMonths: 48, maxMonths: 156 },
  ],
  BC: [
    { token: "infant", minMonths: 0, maxMonths: 36 },
    { token: "toddler", minMonths: 18, maxMonths: 36 },
    { token: "preschool", minMonths: 30, maxMonths: 60 },
    { token: "kindergarten", minMonths: 60, maxMonths: 72 },
    { token: "school-age", minMonths: 72, maxMonths: 144 },
    { token: "multi-age", minMonths: 0, maxMonths: 144 },
  ],
  MB: [
    { token: "infant", minMonths: 3, maxMonths: 24 },
    { token: "toddler", minMonths: 18, maxMonths: 36 },
    { token: "preschool", minMonths: 24, maxMonths: 72 },
    { token: "nursery", minMonths: 24, maxMonths: 72 },
    { token: "kindergarten", minMonths: 60, maxMonths: 72 },
    { token: "school-age", minMonths: 72, maxMonths: 144 },
  ],
  NB: [
    { token: "infant", minMonths: 0, maxMonths: 24 },
    { token: "toddler", minMonths: 18, maxMonths: 36 },
    { token: "preschool", minMonths: 24, maxMonths: 72 },
    { token: "school-age", minMonths: 60, maxMonths: 156 },
  ],
  ON: [
    { token: "infant", minMonths: 0, maxMonths: 18 },
    { token: "toddler", minMonths: 18, maxMonths: 30 },
    { token: "preschool", minMonths: 30, maxMonths: 72 },
    { token: "kindergarten", minMonths: 44, maxMonths: 84 },
    { token: "school-age", minMonths: 68, maxMonths: 156 },
  ],
  QC: [
    { token: "infant", minMonths: 0, maxMonths: 18 },
    { token: "infant (poupon <18 mo)", minMonths: 0, maxMonths: 18 },
    { token: "preschool (to kindergarten)", minMonths: 18, maxMonths: 60 },
    { token: "preschool (18 mo to kindergarten)", minMonths: 18, maxMonths: 60 },
  ],
  NL: STANDARD_SOURCE,
  NS: STANDARD_SOURCE,
  PE: STANDARD_SOURCE,
  SK: STANDARD_SOURCE,
  YT: STANDARD_SOURCE,
};

const CATEGORY_INDEX = new Map<string, SourceCategory>(
  Object.entries(PROVINCE_AGE_CATEGORIES).flatMap(([province, rows]) =>
    rows.map((row) => [`${province}:${row.token}`, row] as const),
  ),
);

export function standardAgeGroup(id: StandardAgeGroupId): StandardAgeGroup {
  const group = STANDARD_AGE_GROUPS.find((row) => row.id === id);
  if (!group) return STANDARD_AGE_GROUPS[0];
  return group;
}

export function standardAgeLabel(id: StandardAgeGroupId, locale: string): string {
  const group = standardAgeGroup(id);
  return locale === "fr" ? group.fr : group.en;
}

export function usableAgeRange(minMonths: number | null | undefined, maxMonths: number | null | undefined): boolean {
  const min = Number(minMonths);
  const max = Number(maxMonths);
  return Number.isFinite(min) && Number.isFinite(max) && max > min && max > 0;
}

export function rangeOverlapsStandardGroup(
  minMonths: number,
  maxMonths: number,
  id: StandardAgeGroupId,
): boolean {
  if (!usableAgeRange(minMonths, maxMonths)) return false;
  const youngerMax = STANDARD_YOUNGER_MAX[id];
  if (youngerMax != null && maxMonths <= youngerMax) return false;
  const group = standardAgeGroup(id);
  const lo = Math.max(minMonths, group.minMonths);
  const hi = Math.min(maxMonths, group.maxMonths);
  return hi > lo;
}

export function standardGroupsForRange(
  minMonths: number | null | undefined,
  maxMonths: number | null | undefined,
): StandardAgeGroupId[] {
  const min = Number(minMonths);
  const max = Number(maxMonths);
  if (!usableAgeRange(min, max)) return [];
  return STANDARD_AGE_GROUP_IDS.filter((id) => rangeOverlapsStandardGroup(min, max, id));
}

/** One child month. Exact 18 is toddler, exact 36 is preschool, 60–72 is none, exact 72 is school-age. */
export function standardGroupForAgeMonths(months: number): StandardAgeGroupId | null {
  if (!Number.isFinite(months) || months < 0) return null;
  if (months < 18) return "infant";
  if (months < 36) return "toddler";
  if (months < 60) return "preschool";
  if (months < 72) return null;
  if (months <= 144) return "school-age";
  return null;
}

/** Spot columns are infant, toddler, and preschool. School-age and the 60–72 gap stay null. */
export function spotAgeForMonths(months: number): "infant" | "toddler" | "preschool" | null {
  const group = standardGroupForAgeMonths(months);
  if (group === "infant" || group === "toddler" || group === "preschool") return group;
  return null;
}

export function normalizeProvinceCode(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim().toUpperCase();
  if (!text) return "";
  return PROVINCE_ALIASES[text] ?? text;
}

export function provinceCodeFromFacilityId(facilityId: string | null | undefined): string {
  const raw = String(facilityId ?? "").trim();
  if (!raw) return "";
  const head = raw.includes("|") ? (raw.split("|")[0] ?? "") : raw.slice(0, 2);
  return normalizeProvinceCode(head);
}

export function normalizeAgeToken(raw: string | null | undefined): string {
  let text = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  text = text.replace(/ \(bands derived from stated range\)$/i, "");
  if (text === "school age") text = "school-age";
  return text;
}

/** Split on commas that are outside parentheses, so QC labels stay one token. */
export function splitAgeGroupTokens(raw: string | null | undefined): string[] {
  const source = String(raw ?? "");
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of source) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      const token = normalizeAgeToken(current);
      if (token) parts.push(token);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = normalizeAgeToken(current);
  if (last) parts.push(last);
  return parts;
}

export function lookupSourceCategory(province: string | null | undefined, token: string | null | undefined): SourceCategory | null {
  const code = normalizeProvinceCode(province);
  const key = normalizeAgeToken(token);
  if (!code || !key) return null;
  return CATEGORY_INDEX.get(`${code}:${key}`) ?? null;
}

/** Null when the token is not a known category. An empty list means the official span matches no group. */
export function sourceCategoryGroups(
  province: string | null | undefined,
  token: string | null | undefined,
): StandardAgeGroupId[] | null {
  const category = lookupSourceCategory(province, token);
  if (!category) return null;
  return standardGroupsForRange(category.minMonths, category.maxMonths);
}

function groupsFromSourceCategories(province: string | null | undefined, ageGroups: string | null | undefined): StandardAgeGroupId[] {
  const ids: StandardAgeGroupId[] = [];
  for (const token of splitAgeGroupTokens(ageGroups)) {
    const category = lookupSourceCategory(province, token);
    if (!category) continue;
    for (const id of standardGroupsForRange(category.minMonths, category.maxMonths)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Confirmed months win. Category tokens are only a fallback when the
 * month range cannot be used. agesKnown false shows nothing.
 */
export function listingStandardGroups(listing: {
  agesKnown?: boolean;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  ageGroups?: string | null;
  province?: string | null;
}): StandardAgeGroupId[] {
  if (listing.agesKnown === false) return [];
  if (usableAgeRange(listing.ageMinMonths, listing.ageMaxMonths)) {
    return standardGroupsForRange(listing.ageMinMonths, listing.ageMaxMonths);
  }
  return groupsFromSourceCategories(listing.province, listing.ageGroups);
}

export function standardAgeLabelsForListing(
  listing: {
    agesKnown?: boolean;
    ageMinMonths?: number | null;
    ageMaxMonths?: number | null;
    ageGroups?: string | null;
    province?: string | null;
  },
  locale: string,
): string[] {
  return listingStandardGroups(listing).map((id) => standardAgeLabel(id, locale));
}

/** Human payload after the machine prefix. The rest of the source string stays as written. */
export function provinceAgeSourceText(raw: string | null | undefined): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  for (const prefix of SOURCE_PREFIXES) {
    const head = `${prefix}:`;
    if (lower.startsWith(head)) {
      text = text.slice(head.length).trim();
      break;
    }
  }
  return text;
}

/** Neon ages_confirmed: missing stays unknown, 0 is not confirmed, 1 is confirmed. */
export function agesKnownFromConfirmedFlag(flag: number | boolean | null | undefined): boolean | undefined {
  if (flag == null) return undefined;
  if (flag === false || flag === 0) return false;
  return true;
}

export type AgeCoverageRow = {
  listingId?: string;
  facilityId?: string;
  province?: string;
  ageMinMonths?: number | null;
  ageMaxMonths?: number | null;
  ageGroups?: string | null;
  agesKnown?: boolean;
};

export type ProvinceAgeCounts = {
  province: string;
  listings: number;
  infant: number;
  toddler: number;
  preschool: number;
  "school-age": number;
  noGroup: number;
};

export type UnmappedAgeCategory = {
  province: string;
  token: string;
  listings: number;
  reason: "unknown" | "no-overlap";
};

export type AgeCoverageReport = {
  provinces: ProvinceAgeCounts[];
  noSourcedRows: string[];
  unmapped: UnmappedAgeCategory[];
};

function emptyCounts(province: string): ProvinceAgeCounts {
  return { province, listings: 0, infant: 0, toddler: 0, preschool: 0, "school-age": 0, noGroup: 0 };
}

/** Read-only counts. A listing can sit in more than one group. */
export function summarizeAgeGroupCoverage(rows: readonly AgeCoverageRow[]): AgeCoverageReport {
  const byProvince = new Map<string, ProvinceAgeCounts>();
  for (const province of SOURCED_PROVINCES) byProvince.set(province, emptyCounts(province));
  const seen = new Set<string>();
  const unmapped = new Map<string, UnmappedAgeCategory>();

  for (const row of rows) {
    const province = normalizeProvinceCode(row.province) || provinceCodeFromFacilityId(row.facilityId);
    if (!province) continue;
    seen.add(province);
    const bucket = byProvince.get(province) ?? emptyCounts(province);
    byProvince.set(province, bucket);
    bucket.listings += 1;
    const known = row.agesKnown !== false;
    const groups = known
      ? listingStandardGroups({
          agesKnown: true,
          ageMinMonths: row.ageMinMonths,
          ageMaxMonths: row.ageMaxMonths,
          ageGroups: row.ageGroups,
          province,
        })
      : [];
    if (!groups.length) bucket.noGroup += 1;
    for (const id of groups) bucket[id] += 1;

    for (const token of splitAgeGroupTokens(row.ageGroups)) {
      const category = lookupSourceCategory(province, token);
      const reason: UnmappedAgeCategory["reason"] | null = !category
        ? "unknown"
        : standardGroupsForRange(category.minMonths, category.maxMonths).length === 0
          ? "no-overlap"
          : null;
      if (!reason) continue;
      const key = `${province}:${token}:${reason}`;
      const current = unmapped.get(key) ?? { province, token, listings: 0, reason };
      current.listings += 1;
      unmapped.set(key, current);
    }
  }

  return {
    provinces: [...byProvince.values()],
    noSourcedRows: SOURCED_PROVINCES.filter((province) => !seen.has(province)),
    unmapped: [...unmapped.values()].sort((a, b) => a.province.localeCompare(b.province) || a.token.localeCompare(b.token)),
  };
}

export function provinceAgeMappingTable() {
  return SOURCED_PROVINCES.map((province) => ({
    province,
    categories: (PROVINCE_AGE_CATEGORIES[province] ?? []).map((category) => ({
      token: category.token,
      minMonths: category.minMonths,
      maxMonths: category.maxMonths,
      groups: standardGroupsForRange(category.minMonths, category.maxMonths),
    })),
  }));
}
