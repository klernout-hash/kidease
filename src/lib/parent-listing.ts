/**
 * Canada parent UX pack — shared listing fields, filters, and honesty.
 *
 * Every desk-editable field here is persisted on `daycares` (or lead_requests)
 * and rendered on the public listing. Openings are never invented.
 */

import { amenityLabel } from "@/lib/amenities";
import {
  classifyFacilityType,
  normalizeFacilityType,
  FACILITY_TYPES,
  type FacilityType,
} from "@/lib/facility-type";
import { hasAmenity } from "@/lib/licensing";
import { hasConfirmedAges } from "@/lib/listing-readiness";
import { clipAgeBand, generatedAgeBands } from "@/lib/public-programs";
import { matchesRailAge } from "@/lib/care-type";
import { honestVacancy, isLiveOrClaimed, type VacancyHonestyInput } from "@/lib/now-loops";
import type { Daycare } from "@/lib/types";

export const PARENT_AGE_BANDS = ["infant", "toddler", "preschool", "school-age"] as const;
export type ParentAgeBand = (typeof PARENT_AGE_BANDS)[number];

export const PARENT_OPENINGS = ["immediate", "upcoming"] as const;
export type ParentOpening = (typeof PARENT_OPENINGS)[number];

export const PARENT_SCHEDULES = ["full", "part", "flexible"] as const;
export type ParentSchedule = (typeof PARENT_SCHEDULES)[number];

/** Parent-facing facility chips — same Canada set as the daycare desk. Empty types stay hidden. */
export const PARENT_FACILITIES = FACILITY_TYPES;
export type ParentFacility = FacilityType;

export const OPENING_WINDOWS = ["immediate", "upcoming", "none"] as const;
export type OpeningWindow = (typeof OPENING_WINDOWS)[number];

export const FINANCIAL_FLAGS = ["subsidy", "sliding", "sibling", "meals"] as const;
export type FinancialFlag = (typeof FINANCIAL_FLAGS)[number];

export type ListingFinancial = Record<FinancialFlag, boolean>;

export const CURRICULUM_TAGS = [
  "play-based",
  "emergent",
  "montessori",
  "reggio",
  "nature",
  "bilingual",
  "literacy",
  "music",
] as const;
export type CurriculumTag = (typeof CURRICULUM_TAGS)[number];

export const SAFETY_FEATURES = [
  "staff-screening",
  "fob",
  "locked-entry",
  "first-aid",
  "cpr",
  "fenced-yard",
] as const;
export type SafetyFeature = (typeof SAFETY_FEATURES)[number];

export const DESK_AMENITIES = [
  "outdoor",
  "meals",
  "extended",
  "inclusive",
  "transit",
  "yard",
  "gym",
  "music",
  "nature",
  "bilingual",
  "french",
  "infant-room",
  "school-age",
  "in-school",
  "evenings",
  "weekends",
  "park",
  "walkable",
  "app",
  "documentation",
] as const;

export const PROMO_TEXT_MAX = 280;
export const VALUES_NOTE_MAX = 280;

export type AgeProgram = {
  band: ParentAgeBand;
  ageMinMonths: number;
  ageMaxMonths: number;
  schedules: ParentSchedule[];
  monthlyFee: number | null;
};

export type ParentListingFields = {
  facilityType: FacilityType | null;
  scheduleOptions: ParentSchedule[];
  openingWindow: OpeningWindow | null;
  programs: AgeProgram[];
  financial: ListingFinancial;
  curriculumTags: string[];
  valuesNote: string | null;
  safetyFeatures: string[];
  promoText: string | null;
};

export type ParentListingSearch = {
  ages: ParentAgeBand[];
  open: ParentOpening[];
  sched: ParentSchedule[];
  fac: ParentFacility[];
};

const AGE_IDS = new Set<string>(PARENT_AGE_BANDS);
const OPEN_IDS = new Set<string>(PARENT_OPENINGS);
const SCHED_IDS = new Set<string>(PARENT_SCHEDULES);
const FAC_IDS = new Set<string>(PARENT_FACILITIES);
const WINDOW_IDS = new Set<string>(OPENING_WINDOWS);
const FIN_IDS = new Set<string>(FINANCIAL_FLAGS);
const CURR_IDS = new Set<string>(CURRICULUM_TAGS);
const SAFE_IDS = new Set<string>(SAFETY_FEATURES);
const AMENITY_IDS = new Set<string>(DESK_AMENITIES);

const BAND_RANGE: Record<ParentAgeBand, { min: number; max: number }> = {
  infant: { min: 0, max: 18 },
  toddler: { min: 18, max: 36 },
  preschool: { min: 30, max: 72 },
  "school-age": { min: 60, max: 144 },
};

export function emptyFinancial(): ListingFinancial {
  return { subsidy: false, sliding: false, sibling: false, meals: false };
}

export function isParentAgeBand(value: string): value is ParentAgeBand {
  return AGE_IDS.has(value);
}

export function isParentOpening(value: string): value is ParentOpening {
  return OPEN_IDS.has(value);
}

export function isParentSchedule(value: string): value is ParentSchedule {
  return SCHED_IDS.has(value);
}

export function isParentFacility(value: string): value is ParentFacility {
  return normalizeFacilityType(value) != null;
}

export function isOpeningWindow(value: string): value is OpeningWindow {
  return WINDOW_IDS.has(value);
}

function csvTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      return csvTokens(JSON.parse(raw));
    } catch {
      /* comma list */
    }
  }
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

function uniqueTokens(values: readonly string[], allowed?: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = value.trim();
    if (!token || seen.has(token)) continue;
    if (allowed && !allowed.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function parseCsvQuery(raw: unknown, allowed: (value: string) => boolean): string[] {
  return csvTokens(raw).filter(allowed);
}

export function parseParentListingSearch(s: Record<string, unknown>): ParentListingSearch {
  return {
    ages: parseCsvQuery(s.ages, isParentAgeBand) as ParentAgeBand[],
    open: parseCsvQuery(s.open, isParentOpening) as ParentOpening[],
    sched: parseCsvQuery(s.sched, isParentSchedule) as ParentSchedule[],
    fac: uniqueTokens(parseCsvQuery(s.fac, isParentFacility).map((id) => normalizeFacilityType(id) ?? id)).filter(
      (id): id is ParentFacility => FAC_IDS.has(id),
    ),
  };
}

export function compactParentListingSearch(values: ParentListingSearch): Partial<Record<"ages" | "open" | "sched" | "fac", string>> {
  const out: Partial<Record<"ages" | "open" | "sched" | "fac", string>> = {};
  if (values.ages.length) out.ages = values.ages.join(",");
  if (values.open.length) out.open = values.open.join(",");
  if (values.sched.length) out.sched = values.sched.join(",");
  if (values.fac.length) out.fac = values.fac.join(",");
  return out;
}

export function parentSearchActive(values: ParentListingSearch): boolean {
  return Boolean(values.ages.length || values.open.length || values.sched.length || values.fac.length);
}

export function normalizeScheduleOptions(values: unknown): ParentSchedule[] {
  return uniqueTokens(csvTokens(values), SCHED_IDS) as ParentSchedule[];
}

export function normalizeOpeningWindow(value: unknown): OpeningWindow | null {
  const raw = String(value ?? "").trim();
  return isOpeningWindow(raw) ? raw : null;
}

export function normalizeFacilityTypeColumn(value: unknown): FacilityType | null {
  return normalizeFacilityType(value);
}

export function normalizeFinancial(value: unknown, amenities = ""): ListingFinancial {
  const next = emptyFinancial();
  const src =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  for (const key of FINANCIAL_FLAGS) {
    if (src[key] === true || src[key] === 1 || src[key] === "true") next[key] = true;
  }
  if (hasAmenity(amenities, "subsidy") || hasAmenity(amenities, "funded") || hasAmenity(amenities, "ten-a-day")) {
    next.subsidy = next.subsidy || hasAmenity(amenities, "subsidy") || hasAmenity(amenities, "funded") || hasAmenity(amenities, "ten-a-day");
  }
  if (hasAmenity(amenities, "sliding-scale")) next.sliding = true;
  if (hasAmenity(amenities, "sibling-discount")) next.sibling = true;
  if (hasAmenity(amenities, "meals")) next.meals = true;
  return next;
}

export function normalizeCurriculumTags(value: unknown, amenities = ""): string[] {
  const fromField = uniqueTokens(csvTokens(value), CURR_IDS);
  const fromAmenities = DESK_AMENITIES.filter((key) => CURR_IDS.has(key) && hasAmenity(amenities, key));
  return uniqueTokens([...fromField, ...fromAmenities], CURR_IDS);
}

export function normalizeSafetyFeatures(value: unknown, amenities = "", staffScreening = false): string[] {
  const fromField = uniqueTokens(csvTokens(value), SAFE_IDS);
  const extras: string[] = [];
  if (staffScreening || hasAmenity(amenities, "licensed")) extras.push("staff-screening");
  if (hasAmenity(amenities, "fob")) extras.push("fob");
  if (hasAmenity(amenities, "yard")) extras.push("fenced-yard");
  return uniqueTokens([...fromField, ...extras], SAFE_IDS);
}

export function normalizePromoText(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, PROMO_TEXT_MAX);
  return text || null;
}

export function normalizeValuesNote(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, VALUES_NOTE_MAX);
  return text || null;
}

export function normalizePrograms(value: unknown): AgeProgram[] {
  if (!Array.isArray(value)) return [];
  const out: AgeProgram[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const band = String(row.band ?? "").trim();
    if (!isParentAgeBand(band)) continue;
    const range = BAND_RANGE[band];
    const min = Number(row.ageMinMonths);
    const max = Number(row.ageMaxMonths);
    const fee = Number(row.monthlyFee);
    out.push({
      band,
      ageMinMonths: Number.isFinite(min) ? Math.max(0, Math.min(216, Math.round(min))) : range.min,
      ageMaxMonths: Number.isFinite(max) ? Math.max(0, Math.min(216, Math.round(max))) : range.max,
      schedules: normalizeScheduleOptions(row.schedules),
      monthlyFee: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : null,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export function parentListingFrom(input: {
  facilityType?: unknown;
  facility_type?: unknown;
  scheduleOptions?: unknown;
  schedule_options?: unknown;
  openingWindow?: unknown;
  opening_window?: unknown;
  programs?: unknown;
  financial?: unknown;
  financial_flags?: unknown;
  curriculumTags?: unknown;
  curriculum_tags?: unknown;
  valuesNote?: unknown;
  values_note?: unknown;
  safetyFeatures?: unknown;
  safety_features?: unknown;
  promoText?: unknown;
  promo_text?: unknown;
  amenities?: string | null;
  staffScreeningAttested?: boolean;
}): ParentListingFields {
  const amenities = input.amenities ?? "";
  return {
    facilityType: normalizeFacilityTypeColumn(input.facilityType ?? input.facility_type),
    scheduleOptions: normalizeScheduleOptions(input.scheduleOptions ?? input.schedule_options),
    openingWindow: normalizeOpeningWindow(input.openingWindow ?? input.opening_window),
    programs: normalizePrograms(input.programs),
    financial: normalizeFinancial(input.financial ?? input.financial_flags, amenities),
    curriculumTags: normalizeCurriculumTags(input.curriculumTags ?? input.curriculum_tags, amenities),
    valuesNote: normalizeValuesNote(input.valuesNote ?? input.values_note),
    safetyFeatures: normalizeSafetyFeatures(
      input.safetyFeatures ?? input.safety_features,
      amenities,
      Boolean(input.staffScreeningAttested),
    ),
    promoText: normalizePromoText(input.promoText ?? input.promo_text),
  };
}

export function parentListingToSql(fields: Partial<ParentListingFields>) {
  const financial = { ...emptyFinancial(), ...fields.financial };
  return {
    facilityType: fields.facilityType ?? null,
    scheduleOptionsJson: JSON.stringify(normalizeScheduleOptions(fields.scheduleOptions ?? [])),
    openingWindow: fields.openingWindow ?? null,
    programsJson: JSON.stringify(normalizePrograms(fields.programs ?? [])),
    financialJson: JSON.stringify(financial),
    curriculumJson: JSON.stringify(uniqueTokens(fields.curriculumTags ?? [], CURR_IDS)),
    valuesNote: normalizeValuesNote(fields.valuesNote),
    safetyJson: JSON.stringify(uniqueTokens(fields.safetyFeatures ?? [], SAFE_IDS)),
    promoText: normalizePromoText(fields.promoText),
  };
}

const FACILITY_AMENITY: Partial<Record<FacilityType, string>> = {
  family_home: "home",
  group_home: "group-home",
  nursery_preschool: "nursery",
  school_age: "in-school",
};

const FINANCIAL_AMENITY: Record<FinancialFlag, string> = {
  subsidy: "subsidy",
  sliding: "sliding-scale",
  sibling: "sibling-discount",
  meals: "meals",
};

const SAFETY_AMENITY: Partial<Record<SafetyFeature, string>> = {
  fob: "fob",
  "fenced-yard": "yard",
};

/** Merge desk-owned flags into the amenities CSV without dropping catalogue tags. */
export function mergeListingAmenities(
  existing: string,
  next: {
    facilityType?: FacilityType | null;
    financial?: ListingFinancial;
    curriculumTags?: readonly string[];
    safetyFeatures?: readonly string[];
    amenityKeys?: readonly string[];
  },
): string {
  const keys = new Set(
    existing
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  for (const drop of ["home", "group-home", "nursery", "in-school"]) keys.delete(drop);
  if (next.facilityType && FACILITY_AMENITY[next.facilityType]) {
    keys.add(FACILITY_AMENITY[next.facilityType]!);
  }
  for (const flag of FINANCIAL_FLAGS) {
    const amenity = FINANCIAL_AMENITY[flag];
    if (next.financial?.[flag]) keys.add(amenity);
    else if (next.financial) keys.delete(amenity);
  }
  for (const tag of CURRICULUM_TAGS) {
    if (next.curriculumTags?.includes(tag)) keys.add(tag);
    else if (next.curriculumTags) keys.delete(tag);
  }
  for (const [feature, amenity] of Object.entries(SAFETY_AMENITY)) {
    if (next.safetyFeatures?.includes(feature)) keys.add(amenity);
    else if (next.safetyFeatures) keys.delete(amenity);
  }
  for (const key of next.amenityKeys ?? []) {
    if (AMENITY_IDS.has(key)) keys.add(key);
  }
  if (next.amenityKeys) {
    for (const key of DESK_AMENITIES) {
      if (!next.amenityKeys.includes(key) && !CURR_IDS.has(key) && !FIN_IDS.has(key as FinancialFlag)) {
        if (!Object.values(FINANCIAL_AMENITY).includes(key) && !Object.values(SAFETY_AMENITY).includes(key)) {
          if (!next.curriculumTags?.includes(key)) keys.delete(key);
        }
      }
    }
  }
  return [...keys].join(",");
}

export function listingFacilityClass(item: {
  facilityType?: FacilityType | string | null;
  amenities?: string | null;
  name?: string | null;
}) {
  return classifyFacilityType({
    amenities: item.amenities,
    name: item.name,
    facilityType: item.facilityType,
  });
}

export function parentFacilityOf(item: {
  facilityType?: FacilityType | string | null;
  amenities?: string | null;
  name?: string | null;
}): ParentFacility {
  return listingFacilityClass(item).type;
}

/**
 * Immediate only when honest vacancy is open (fresh claimed spots).
 * Upcoming only when the director set that window and vacancy data exists.
 * Never invent openings from unclaimed / stale rows.
 */
export function honestOpeningWindow(
  d: VacancyHonestyInput & Pick<Daycare, "openingWindow" | "availabilityKnown">,
  now = Date.now(),
): ParentOpening | null {
  const vacancy = honestVacancy(d, now);
  if (vacancy.kind === "open") return "immediate";
  if (d.openingWindow === "upcoming" && isLiveOrClaimed(d) && d.availabilityKnown) {
    return "upcoming";
  }
  return null;
}

export function listingSchedules(d: Pick<Daycare, "scheduleOptions">): ParentSchedule[] {
  return normalizeScheduleOptions(d.scheduleOptions ?? []);
}

export function listingPrograms(d: Pick<
  Daycare,
  | "programs"
  | "agesKnown"
  | "ageMinMonths"
  | "ageMaxMonths"
  | "infantMonthly"
  | "toddlerMonthly"
  | "preschoolMonthly"
  | "scheduleOptions"
>): AgeProgram[] {
  const stored = normalizePrograms(d.programs);
  if (stored.length) {
    if (!hasConfirmedAges(d)) return stored;
    return stored.flatMap((row) => {
      const clip = clipAgeBand(d.ageMinMonths, d.ageMaxMonths, row.band);
      if (!clip) return [];
      return [{ ...row, ageMinMonths: clip.min, ageMaxMonths: clip.max }];
    });
  }
  if (!hasConfirmedAges(d)) return [];
  const schedules = listingSchedules(d);
  return generatedAgeBands(d).map((row) => ({
    band: row.band,
    ageMinMonths: row.ageMinMonths,
    ageMaxMonths: row.ageMaxMonths,
    schedules,
    monthlyFee: row.monthlyFee,
  }));
}

export function programFeeKnown(
  program: AgeProgram,
  d: Pick<Daycare, "feeConfirmed" | "live">,
): boolean {
  return Boolean((d.feeConfirmed || d.live) && program.monthlyFee && program.monthlyFee > 0);
}

export function listingAgeChips(
  d: Pick<
    Daycare,
    | "agesKnown"
    | "ageMinMonths"
    | "ageMaxMonths"
    | "amenities"
    | "programs"
    | "infantMonthly"
    | "toddlerMonthly"
    | "preschoolMonthly"
    | "partTimeMonthly"
    | "scheduleOptions"
  >,
): ParentAgeBand[] {
  return listingPrograms(d)
    .map((row) => row.band)
    .filter((band, i, all) => all.indexOf(band) === i)
    .slice(0, 2);
}

export function matchesParentAge(d: Pick<Daycare, "agesKnown" | "ageMinMonths" | "ageMaxMonths" | "amenities">, age: ParentAgeBand): boolean {
  return matchesRailAge(d, age);
}

export function matchesParentOpening(
  d: VacancyHonestyInput & Pick<Daycare, "openingWindow" | "availabilityKnown">,
  opening: ParentOpening,
  now = Date.now(),
): boolean {
  return honestOpeningWindow(d, now) === opening;
}

export function matchesParentSchedule(d: Pick<Daycare, "scheduleOptions">, schedule: ParentSchedule): boolean {
  return listingSchedules(d).includes(schedule);
}

export function matchesParentFacility(
  item: { facilityType?: FacilityType | null; amenities?: string | null; name?: string | null },
  facility: ParentFacility,
): boolean {
  return parentFacilityOf(item) === facility;
}

export function matchesParentListingFilters<
  T extends VacancyHonestyInput &
    Pick<
      Daycare,
      | "agesKnown"
      | "ageMinMonths"
      | "ageMaxMonths"
      | "amenities"
      | "scheduleOptions"
      | "openingWindow"
      | "availabilityKnown"
      | "facilityType"
      | "name"
    >,
>(item: T, filters: ParentListingSearch, now = Date.now()): boolean {
  if (filters.ages.length && !filters.ages.some((age) => matchesParentAge(item, age))) return false;
  if (filters.open.length && !filters.open.some((open) => matchesParentOpening(item, open, now))) return false;
  if (filters.sched.length && !filters.sched.some((sched) => matchesParentSchedule(item, sched))) return false;
  if (filters.fac.length && !filters.fac.some((fac) => matchesParentFacility(item, fac))) return false;
  return true;
}

export type ParentChipVisibility = {
  ages: ParentAgeBand[];
  openings: ParentOpening[];
  schedules: ParentSchedule[];
  facilities: ParentFacility[];
};

/** Hide options that cannot match any live public listing in the current set. */
export function visibleParentChipOptions<
  T extends VacancyHonestyInput &
    Pick<
      Daycare,
      | "agesKnown"
      | "ageMinMonths"
      | "ageMaxMonths"
      | "amenities"
      | "scheduleOptions"
      | "openingWindow"
      | "availabilityKnown"
      | "facilityType"
      | "name"
    >,
>(listings: readonly T[], now = Date.now()): ParentChipVisibility {
  const ages = PARENT_AGE_BANDS.filter((age) => listings.some((row) => matchesParentAge(row, age)));
  const openings = PARENT_OPENINGS.filter((open) => listings.some((row) => matchesParentOpening(row, open, now)));
  const schedules = PARENT_SCHEDULES.filter((sched) => listings.some((row) => matchesParentSchedule(row, sched)));
  const facilities = PARENT_FACILITIES.filter((fac) => listings.some((row) => matchesParentFacility(row, fac)));
  return { ages, openings, schedules, facilities };
}

export function listingInfoSlaReady(d: { claimed?: boolean; contactEmail?: string | null; inboxMailReady?: boolean }): boolean {
  if (typeof d.inboxMailReady === "boolean") return d.inboxMailReady;
  return Boolean(d.claimed) && Boolean((d.contactEmail || "").trim());
}

export function financialLabels(financial: ListingFinancial, locale: string): string[] {
  const rows: Array<[FinancialFlag, string, string]> = [
    ["subsidy", "Subsidy-friendly", "Adapté à la subvention"],
    ["sliding", "Sliding-scale fees", "Tarif selon le revenu"],
    ["sibling", "Sibling discount", "Rabais fratrie"],
    ["meals", "Meals included", "Repas inclus"],
  ];
  return rows.filter(([key]) => financial[key]).map(([, en, fr]) => (locale === "fr" ? fr : en));
}

export function curriculumLabel(id: string, locale: string): string {
  const map: Record<string, { en: string; fr: string }> = {
    "play-based": { en: "Play-based", fr: "Axé sur le jeu" },
    emergent: { en: "Emergent curriculum", fr: "Curriculum émergent" },
    montessori: { en: "Montessori", fr: "Montessori" },
    reggio: { en: "Reggio Emilia", fr: "Reggio Emilia" },
    nature: { en: "Nature-based", fr: "Pédagogie nature" },
    bilingual: { en: "Bilingual", fr: "Bilingue" },
    literacy: { en: "Literacy-forward", fr: "Littératie" },
    music: { en: "Music program", fr: "Programme de musique" },
  };
  return map[id]?.[locale === "fr" ? "fr" : "en"] ?? amenityLabel(id, locale);
}

export function safetyLabel(id: string, locale: string): string {
  const map: Record<string, { en: string; fr: string }> = {
    "staff-screening": { en: "Staff screening attested", fr: "Vérification du personnel attestée" },
    fob: { en: "Fob / controlled entry", fr: "Accès contrôlé (fob)" },
    "locked-entry": { en: "Locked entry", fr: "Entrée verrouillée" },
    "first-aid": { en: "First aid on site", fr: "Premiers soins sur place" },
    cpr: { en: "CPR trained staff", fr: "Personnel formé en RCR" },
    "fenced-yard": { en: "Fenced yard", fr: "Cour clôturée" },
  };
  return map[id]?.[locale === "fr" ? "fr" : "en"] ?? amenityLabel(id, locale);
}

export function parentAgeLabel(band: ParentAgeBand, locale: string): string {
  const map: Record<ParentAgeBand, { en: string; fr: string }> = {
    infant: { en: "Infants (0–18 mo)", fr: "Nourrissons (0–18 mois)" },
    toddler: { en: "Toddlers (18–36 mo)", fr: "Tout-petits (18–36 mois)" },
    preschool: { en: "Preschool (2.5–6 yr)", fr: "Préscolaire (2,5–6 ans)" },
    "school-age": { en: "School-age", fr: "Âge scolaire" },
  };
  return locale === "fr" ? map[band].fr : map[band].en;
}

export function parentScheduleLabel(id: ParentSchedule, locale: string): string {
  const map: Record<ParentSchedule, { en: string; fr: string }> = {
    full: { en: "Full-time", fr: "Temps plein" },
    part: { en: "Part-time", fr: "Temps partiel" },
    flexible: { en: "Flexible", fr: "Flexible" },
  };
  return locale === "fr" ? map[id].fr : map[id].en;
}

export function parentFacilityLabel(id: ParentFacility | string, locale: string): string {
  const kind = normalizeFacilityType(id) ?? "child_care_centre";
  const map: Record<ParentFacility, { en: string; fr: string }> = {
    child_care_centre: { en: "Child care centre", fr: "Centre de garde" },
    family_home: { en: "Family child care", fr: "Milieu familial" },
    group_home: { en: "Group child care home", fr: "Milieu familial de groupe" },
    nursery_preschool: { en: "Nursery school / preschool", fr: "Nursery / prématernelle" },
    school_age: { en: "School-age", fr: "Parascolaire" },
  };
  return locale === "fr" ? map[kind].fr : map[kind].en;
}

export function facilityTypeCopyKey(type: FacilityType): "facilityTypeCentre" | "facilityTypeHome" | "facilityTypeGroupHome" | "facilityTypeNursery" | "facilityTypeSchool" {
  if (type === "family_home") return "facilityTypeHome";
  if (type === "group_home") return "facilityTypeGroupHome";
  if (type === "nursery_preschool") return "facilityTypeNursery";
  if (type === "school_age") return "facilityTypeSchool";
  return "facilityTypeCentre";
}

export function parentOpeningLabel(id: ParentOpening, locale: string): string {
  const map: Record<ParentOpening, { en: string; fr: string }> = {
    immediate: { en: "Immediate", fr: "Immédiat" },
    upcoming: { en: "Upcoming", fr: "À venir" },
  };
  return locale === "fr" ? map[id].fr : map[id].en;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInfoContact(input: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  message?: string;
}) {
  const firstName = input.firstName.trim().replace(/\s+/g, " ").slice(0, 80);
  const lastName = input.lastName.trim().replace(/\s+/g, " ").slice(0, 80);
  const phone = input.phone.trim().replace(/\s+/g, " ").slice(0, 40);
  const email = input.email.trim().toLowerCase().slice(0, 160);
  const message = (input.message || "").trim().replace(/\s+/g, " ").slice(0, 1000) || null;
  const errors: string[] = [];
  if (firstName.length < 1) errors.push("first");
  if (lastName.length < 1) errors.push("last");
  if (phone.length < 7) errors.push("phone");
  if (!EMAIL_RE.test(email)) errors.push("email");
  return { firstName, lastName, phone, email, message, errors, ok: errors.length === 0 };
}

export function guestInfoUserId(email: string): string {
  return `guest:${email.trim().toLowerCase().slice(0, 120)}`;
}
