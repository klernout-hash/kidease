/**
 * Staff job board: profile rules, privacy gate, vetting checklist and the match score.
 *
 * FEATURE_STAFF_JOB_BOARD defaults off. Nothing here sends a message or charges.
 *
 * The match score is a plain function. It reads only job facts: certificate,
 * distance from the city the person picked, days, shifts, room groups, full or
 * part time, years of experience and start date. It never reads a name, age,
 * gender, family status, religion, ethnicity, disability, language or any other
 * protected ground, and it does not guess one. The provider decides every step.
 *
 * Pure validation and data projection; runnable directly in Node tests.
 */

import { exactCity } from "./geo.ts";

export const STAFF_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type StaffDay = (typeof STAFF_DAYS)[number];
export const WEEKDAYS: readonly StaffDay[] = ["mon", "tue", "wed", "thu", "fri"];

export const STAFF_SHIFTS = ["morning", "afternoon", "full_day", "evening"] as const;
export type StaffShift = (typeof STAFF_SHIFTS)[number];

export const WORK_TYPES = ["full_time", "part_time", "casual"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/** Rooms the person works in (children's groups). Not the person's own age. */
export const CARE_GROUPS = ["infant", "toddler", "preschool", "school_age"] as const;
export type CareGroup = (typeof CARE_GROUPS)[number];

export const STAFF_LANGUAGES = ["en", "fr", "es", "pa", "zh", "ar", "tl", "it", "de", "other"] as const;
export type StaffLanguage = (typeof STAFF_LANGUAGES)[number];

export const STAFF_VISIBILITY = ["open", "applied_only", "paused"] as const;
export type StaffVisibility = (typeof STAFF_VISIBILITY)[number];

export const APPLICATION_STAGES = ["applied", "viewed", "interview", "offer", "hired", "not_selected"] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const VETTING_ITEMS = ["certificate", "first_aid", "background_check", "references"] as const;
export type VettingItem = (typeof VETTING_ITEMS)[number];
export const VETTING_STATES = ["to_do", "checked", "not_needed"] as const;
export type VettingState = (typeof VETTING_STATES)[number];

export const PROVINCE_CODES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const STAFF_HIGHLIGHTS_MAX = 140;
export const JOB_TITLE_MAX = 80;
export const JOB_ABOUT_MAX = 600;
export const RADIUS_CHOICES = [5, 10, 15, 25, 50] as const;
export const DEFAULT_RADIUS_KM = 15;
/** Pay is per hour, in dollars. The range guards typos, not wages. */
export const PAY_MIN_DOLLARS = 15;
export const PAY_MAX_DOLLARS = 80;
export const EXPIRY_SOON_DAYS = 60;

export type CertLevel = { id: string; rank: number; en: string; fr: string };

/**
 * Province names for ECE levels. Rank lines levels up inside one province
 * (1 = entry, 4 = specialist). Kyle: please check the names before launch.
 */
export const CERT_LEVELS: Record<ProvinceCode, readonly CertLevel[]> = {
  AB: [
    { id: "ab_l1", rank: 1, en: "Level 1 ECE", fr: "EPE niveau 1" },
    { id: "ab_l2", rank: 2, en: "Level 2 ECE", fr: "EPE niveau 2" },
    { id: "ab_l3", rank: 3, en: "Level 3 ECE", fr: "EPE niveau 3" },
  ],
  BC: [
    { id: "bc_ecea", rank: 1, en: "ECE Assistant", fr: "Aide-EPE" },
    { id: "bc_ece1", rank: 2, en: "ECE (one-year)", fr: "EPE (un an)" },
    { id: "bc_ece5", rank: 3, en: "ECE (five-year)", fr: "EPE (cinq ans)" },
    { id: "bc_ite", rank: 4, en: "Infant and Toddler Educator", fr: "Éducatrice poupons et trottineurs" },
    { id: "bc_sne", rank: 4, en: "Special Needs Educator", fr: "Éducatrice besoins particuliers" },
  ],
  MB: [
    { id: "mb_cca", rank: 1, en: "Child Care Assistant", fr: "Aide en garde d’enfants" },
    { id: "mb_ece2", rank: 2, en: "ECE II", fr: "EPE II" },
    { id: "mb_ece3", rank: 3, en: "ECE III", fr: "EPE III" },
  ],
  NB: [
    { id: "nb_entry", rank: 1, en: "Entry level", fr: "Niveau d’entrée" },
    { id: "nb_cert", rank: 2, en: "One-year ECE certificate", fr: "Certificat EPE d’un an" },
    { id: "nb_dip", rank: 3, en: "ECE diploma or degree", fr: "Diplôme ou grade en EPE" },
  ],
  NL: [
    { id: "nl_entry", rank: 1, en: "Entry Level", fr: "Niveau d’entrée" },
    { id: "nl_l1", rank: 2, en: "Level I", fr: "Niveau I" },
    { id: "nl_l2", rank: 3, en: "Level II", fr: "Niveau II" },
    { id: "nl_l3", rank: 4, en: "Level III", fr: "Niveau III" },
    { id: "nl_l4", rank: 4, en: "Level IV", fr: "Niveau IV" },
  ],
  NS: [
    { id: "ns_entry", rank: 1, en: "Entry Level", fr: "Niveau d’entrée" },
    { id: "ns_l1", rank: 2, en: "Level 1", fr: "Niveau 1" },
    { id: "ns_l2", rank: 3, en: "Level 2", fr: "Niveau 2" },
    { id: "ns_l3", rank: 4, en: "Level 3", fr: "Niveau 3" },
  ],
  NT: [{ id: "nt_ece", rank: 2, en: "ECE certificate or diploma", fr: "Certificat ou diplôme en EPE" }],
  NU: [{ id: "nu_ece", rank: 2, en: "ECE certificate or diploma", fr: "Certificat ou diplôme en EPE" }],
  ON: [{ id: "on_rece", rank: 3, en: "Registered ECE (RECE)", fr: "EPE inscrite (EPEI)" }],
  PE: [
    { id: "pe_entry", rank: 1, en: "Entry level", fr: "Niveau d’entrée" },
    { id: "pe_l1", rank: 2, en: "Level 1", fr: "Niveau 1" },
    { id: "pe_l2", rank: 3, en: "Level 2", fr: "Niveau 2" },
    { id: "pe_l3", rank: 4, en: "Level 3", fr: "Niveau 3" },
  ],
  QC: [
    { id: "qc_unq", rank: 1, en: "Educator, not yet qualified", fr: "Éducatrice non qualifiée" },
    { id: "qc_q", rank: 3, en: "Qualified educator (DEC or AEC)", fr: "Éducatrice qualifiée (DEC ou AEC)" },
  ],
  SK: [
    { id: "sk_l1", rank: 1, en: "ECE Level I", fr: "EPE niveau I" },
    { id: "sk_l2", rank: 2, en: "ECE Level II", fr: "EPE niveau II" },
    { id: "sk_l3", rank: 3, en: "ECE Level III", fr: "EPE niveau III" },
  ],
  YT: [
    { id: "yt_l1", rank: 1, en: "Level I", fr: "Niveau I" },
    { id: "yt_l2", rank: 2, en: "Level II", fr: "Niveau II" },
    { id: "yt_l3", rank: 3, en: "Level III", fr: "Niveau III" },
  ],
};

/** "No certificate yet" for staff; "Any level" for a job. */
export const NO_CERT = "none";

export function isProvinceCode(value: unknown): value is ProvinceCode {
  return typeof value === "string" && (PROVINCE_CODES as readonly string[]).includes(value);
}

export function provinceCode(value: unknown): ProvinceCode | "" {
  const v = String(value ?? "").trim().toUpperCase();
  if (isProvinceCode(v)) return v;
  if (v === "PEI") return "PE";
  return "";
}

export function certLevelsFor(province: unknown): readonly CertLevel[] {
  const code = provinceCode(province);
  return code ? CERT_LEVELS[code] : [];
}

export function findCertLevel(id: unknown): (CertLevel & { province: ProvinceCode }) | null {
  const want = String(id ?? "").trim();
  if (!want || want === NO_CERT) return null;
  for (const code of PROVINCE_CODES) {
    const hit = CERT_LEVELS[code].find((row) => row.id === want);
    if (hit) return { ...hit, province: code };
  }
  return null;
}

export function certLevelLabel(id: unknown, locale: "en" | "fr"): string {
  const hit = findCertLevel(id);
  if (!hit) return "";
  return locale === "fr" ? hit.fr : hit.en;
}

function pickList<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const seen = new Set<T>();
  for (const part of parts) {
    const v = String(part ?? "").trim() as T;
    if ((allowed as readonly string[]).includes(v)) seen.add(v);
  }
  return allowed.filter((value) => seen.has(value));
}

export const pickDays = (raw: unknown) => pickList(raw, STAFF_DAYS);
export const pickShifts = (raw: unknown) => pickList(raw, STAFF_SHIFTS);
export const pickCareGroups = (raw: unknown) => pickList(raw, CARE_GROUPS);
export const pickLanguages = (raw: unknown) => pickList(raw, STAFF_LANGUAGES);
export const pickWorkTypes = (raw: unknown) => pickList(raw, WORK_TYPES);

export function joinList(values: readonly string[]): string {
  return values.join(",");
}

export function pickWorkType(raw: unknown): WorkType | "" {
  const v = String(raw ?? "").trim();
  return (WORK_TYPES as readonly string[]).includes(v) ? (v as WorkType) : "";
}

export function pickVisibility(raw: unknown): StaffVisibility {
  const v = String(raw ?? "").trim();
  return (STAFF_VISIBILITY as readonly string[]).includes(v) ? (v as StaffVisibility) : "open";
}

export function pickStage(raw: unknown): ApplicationStage {
  const v = String(raw ?? "").trim();
  return (APPLICATION_STAGES as readonly string[]).includes(v) ? (v as ApplicationStage) : "applied";
}

export function pickVettingState(raw: unknown): VettingState {
  const v = String(raw ?? "").trim();
  return (VETTING_STATES as readonly string[]).includes(v) ? (v as VettingState) : "to_do";
}

/** yyyy-mm-dd or null. */
export function cleanDate(raw: unknown): string | null {
  const v = String(raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const at = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(at) ? null : v;
}

export function cleanText(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanName(raw: unknown): string {
  return cleanText(raw, 60);
}

/** Canadian postal code, upper case with one space, or "". */
export function cleanPostalCode(raw: unknown): string {
  const v = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z]\d[A-CEGHJ-NPR-TV-Z]\d$/.test(v)) return "";
  return `${v.slice(0, 3)} ${v.slice(3)}`;
}

export function cleanYears(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 50);
}

export function cleanRadius(raw: unknown): number {
  const n = Number(raw);
  return (RADIUS_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_RADIUS_KM;
}

/** Dollars per hour to cents, or null. */
export function payCents(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export type ExpiryState = "missing" | "expired" | "soon" | "ok";

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function expiryState(date: string | null | undefined, today: string): ExpiryState {
  const iso = cleanDate(date);
  if (!iso) return "missing";
  const left = dayNumber(iso) - dayNumber(today);
  if (left < 0) return "expired";
  if (left <= EXPIRY_SOON_DAYS) return "soon";
  return "ok";
}

// ---------------------------------------------------------------------------
// Match score
// ---------------------------------------------------------------------------

/**
 * Every field the scorer may read about a person. Job facts only.
 * scripts/staff-jobs.test.mjs fails if a protected ground shows up here.
 */
export const STAFF_MATCH_FIELDS = [
  "certLevel",
  "certExpiresOn",
  "firstAidExpiresOn",
  "yearsExperience",
  "careGroups",
  "days",
  "shifts",
  "workTypes",
  "startDate",
  "distanceKm",
  "radiusKm",
] as const;

export type StaffMatchInput = {
  certLevel: string;
  certExpiresOn: string | null;
  firstAidExpiresOn: string | null;
  yearsExperience: number;
  careGroups: readonly CareGroup[];
  days: readonly StaffDay[];
  shifts: readonly StaffShift[];
  workTypes: readonly WorkType[];
  startDate: string | null;
  /** From the city the person picked to the centre. Null when unknown. */
  distanceKm: number | null;
  radiusKm: number;
};

export const JOB_MATCH_FIELDS = [
  "province",
  "certNeeded",
  "careGroups",
  "days",
  "shifts",
  "workType",
  "startDate",
] as const;

export type JobMatchInput = {
  province: string;
  certNeeded: string;
  careGroups: readonly CareGroup[];
  days: readonly StaffDay[];
  shifts: readonly StaffShift[];
  workType: WorkType | "";
  startDate: string | null;
};

// Compile-time: the field lists above name every key of the input types.
type _StaffKeysCovered = Exclude<keyof StaffMatchInput, (typeof STAFF_MATCH_FIELDS)[number]> extends never ? true : never;
type _JobKeysCovered = Exclude<keyof JobMatchInput, (typeof JOB_MATCH_FIELDS)[number]> extends never ? true : never;
export const _staffKeysCovered: _StaffKeysCovered = true;
export const _jobKeysCovered: _JobKeysCovered = true;

/** Copy only the allowed fields. Anything else on the record is dropped. */
export function toStaffMatchInput(record: Record<string, unknown>): StaffMatchInput {
  const distance = record.distanceKm;
  return {
    certLevel: String(record.certLevel ?? ""),
    certExpiresOn: cleanDate(record.certExpiresOn),
    firstAidExpiresOn: cleanDate(record.firstAidExpiresOn),
    yearsExperience: cleanYears(record.yearsExperience),
    careGroups: pickCareGroups(record.careGroups),
    days: pickDays(record.days),
    shifts: pickShifts(record.shifts),
    workTypes: pickWorkTypes(record.workTypes),
    startDate: cleanDate(record.startDate),
    distanceKm: typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? distance : null,
    radiusKm: cleanRadius(record.radiusKm),
  };
}

export function toJobMatchInput(record: Record<string, unknown>): JobMatchInput {
  return {
    province: provinceCode(record.province),
    certNeeded: String(record.certNeeded ?? "") || NO_CERT,
    careGroups: pickCareGroups(record.careGroups),
    days: pickDays(record.days),
    shifts: pickShifts(record.shifts),
    workType: pickWorkType(record.workType),
    startDate: cleanDate(record.startDate),
  };
}

export type MatchReason =
  | { code: "cert_meets"; level: string }
  | { code: "cert_other_province"; level: string; province: ProvinceCode }
  | { code: "cert_below"; level: string; needed: string }
  | { code: "cert_missing"; needed: string }
  | { code: "cert_not_needed" }
  | { code: "cert_expired"; level: string }
  | { code: "distance"; km: number }
  | { code: "distance_far"; km: number }
  | { code: "days_all"; weekdays: boolean; days: StaffDay[] }
  | { code: "days_some"; have: number; need: number }
  | { code: "days_none" }
  | { code: "shifts"; shifts: StaffShift[] }
  | { code: "shifts_none" }
  | { code: "care_groups"; groups: CareGroup[] }
  | { code: "care_groups_none" }
  | { code: "work_type"; workType: WorkType }
  | { code: "work_type_other"; workType: WorkType }
  | { code: "experience"; years: number }
  | { code: "start_late"; date: string }
  | { code: "first_aid_expired" }
  | { code: "first_aid_missing" };

export type MatchFlag = "cert_expired" | "first_aid_expired" | "cert_missing_date";

export type MatchResult = {
  /** 0 to 100. A guide for sorting, never a yes or no. */
  score: number;
  /** Things that fit, in plain words once explained. */
  good: MatchReason[];
  /** Things to talk about. Never a reason to hide someone. */
  check: MatchReason[];
  flags: MatchFlag[];
};

export const MATCH_WEIGHTS = {
  cert: 35,
  distance: 20,
  days: 15,
  careGroups: 10,
  shifts: 10,
  workType: 5,
  experience: 5,
} as const;

function overlap<T>(want: readonly T[], have: readonly T[]): T[] {
  const set = new Set(have);
  return want.filter((value) => set.has(value));
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/**
 * Deterministic score. Same input, same output. Reads only the fields named in
 * STAFF_MATCH_FIELDS and JOB_MATCH_FIELDS, plus today's date for expiry.
 */
export function scoreMatch(staffRaw: StaffMatchInput, jobRaw: JobMatchInput, today: string): MatchResult {
  // Copy through the allow-list so extra keys on the objects can never count.
  const staff = toStaffMatchInput(staffRaw as unknown as Record<string, unknown>);
  const job = toJobMatchInput(jobRaw as unknown as Record<string, unknown>);
  const good: MatchReason[] = [];
  const check: MatchReason[] = [];
  const flags: MatchFlag[] = [];
  let score = 0;

  // Certificate.
  const have = findCertLevel(staff.certLevel);
  const need = findCertLevel(job.certNeeded);
  const certState = have ? expiryState(staff.certExpiresOn, today) : "missing";
  if (have && certState === "expired") {
    flags.push("cert_expired");
    check.push({ code: "cert_expired", level: have.id });
  } else if (!need) {
    if (have) {
      score += MATCH_WEIGHTS.cert;
      good.push({ code: "cert_meets", level: have.id });
    } else {
      score += Math.round(MATCH_WEIGHTS.cert * 0.7);
      good.push({ code: "cert_not_needed" });
    }
  } else if (!have) {
    check.push({ code: "cert_missing", needed: need.id });
  } else {
    const gap = need.rank - have.rank;
    if (gap <= 0) {
      score += MATCH_WEIGHTS.cert;
      good.push({ code: "cert_meets", level: have.id });
    } else if (gap === 1) {
      score += Math.round(MATCH_WEIGHTS.cert * 0.4);
      check.push({ code: "cert_below", level: have.id, needed: need.id });
    } else {
      check.push({ code: "cert_below", level: have.id, needed: need.id });
    }
    if (job.province && have.province !== job.province) {
      check.push({ code: "cert_other_province", level: have.id, province: have.province });
    }
  }
  if (have && certState === "missing") flags.push("cert_missing_date");

  // First aid. A flag for the provider; it does not move the score.
  const aid = expiryState(staff.firstAidExpiresOn, today);
  if (aid === "expired") {
    flags.push("first_aid_expired");
    check.push({ code: "first_aid_expired" });
  } else if (aid === "missing") {
    check.push({ code: "first_aid_missing" });
  }

  // Distance from the city the person picked.
  if (staff.distanceKm !== null) {
    const km = Math.round(staff.distanceKm);
    const radius = Math.max(1, staff.radiusKm);
    if (staff.distanceKm <= radius) {
      score += Math.round(MATCH_WEIGHTS.distance * (1 - 0.5 * (staff.distanceKm / radius)));
      good.push({ code: "distance", km });
    } else if (staff.distanceKm <= radius * 2) {
      score += Math.round(MATCH_WEIGHTS.distance * 0.25);
      check.push({ code: "distance_far", km });
    } else {
      check.push({ code: "distance_far", km });
    }
  }

  // Days.
  const needDays = job.days.length ? job.days : WEEKDAYS;
  const dayHits = overlap(needDays, staff.days);
  if (dayHits.length === needDays.length) {
    score += MATCH_WEIGHTS.days;
    good.push({ code: "days_all", weekdays: sameSet(needDays, WEEKDAYS), days: [...needDays] });
  } else if (dayHits.length) {
    score += Math.round(MATCH_WEIGHTS.days * (dayHits.length / needDays.length));
    check.push({ code: "days_some", have: dayHits.length, need: needDays.length });
  } else {
    check.push({ code: "days_none" });
  }

  // Room groups.
  if (job.careGroups.length) {
    const hits = overlap(job.careGroups, staff.careGroups);
    if (hits.length) {
      score += Math.round(MATCH_WEIGHTS.careGroups * (hits.length / job.careGroups.length));
      good.push({ code: "care_groups", groups: hits });
    } else {
      check.push({ code: "care_groups_none" });
    }
  } else {
    score += MATCH_WEIGHTS.careGroups;
    if (staff.careGroups.length) good.push({ code: "care_groups", groups: [...staff.careGroups] });
  }

  // Shifts.
  if (job.shifts.length) {
    const hits = overlap(job.shifts, staff.shifts);
    if (hits.length) {
      score += Math.round(MATCH_WEIGHTS.shifts * (hits.length / job.shifts.length));
      good.push({ code: "shifts", shifts: hits });
    } else {
      check.push({ code: "shifts_none" });
    }
  } else {
    score += MATCH_WEIGHTS.shifts;
  }

  // Full or part time.
  if (job.workType) {
    if (!staff.workTypes.length || staff.workTypes.includes(job.workType)) {
      score += MATCH_WEIGHTS.workType;
      good.push({ code: "work_type", workType: job.workType });
    } else {
      check.push({ code: "work_type_other", workType: staff.workTypes[0] as WorkType });
    }
  } else {
    score += MATCH_WEIGHTS.workType;
  }

  // Experience. Capped at 5 years so a long career is not a stand-in for anything else.
  const years = Math.min(staff.yearsExperience, 5);
  if (years > 0) {
    score += years;
    good.push({ code: "experience", years: staff.yearsExperience });
  }

  // Start date: a talking point only.
  if (job.startDate && staff.startDate && staff.startDate > job.startDate) {
    check.push({ code: "start_late", date: staff.startDate });
  }

  return { score: Math.max(0, Math.min(100, score)), good, check, flags };
}

// ---------------------------------------------------------------------------
// Privacy gate (Kyle's rule)
// ---------------------------------------------------------------------------

export type StaffProfileRecord = {
  ref: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  province: ProvinceCode | "";
  city: string;
  postalCode: string;
  radiusKm: number;
  certLevel: string;
  certExpiresOn: string | null;
  firstAidExpiresOn: string | null;
  yearsExperience: number;
  careGroups: CareGroup[];
  days: StaffDay[];
  shifts: StaffShift[];
  workTypes: WorkType[];
  startDate: string | null;
  languages: StaffLanguage[];
  highlights: string;
  hasResume: boolean;
  visibility: StaffVisibility;
  hideFromEmployer: boolean;
};

export type StaffAvailability = {
  days: StaffDay[];
  shifts: StaffShift[];
  workTypes: WorkType[];
  startDate: string | null;
};

/** What a provider sees before the person applies, accepts an invite, or is hired. */
export type LimitedStaffProfile = {
  view: "limited";
  ref: string;
  firstName: string;
  certLevel: string;
  /** City and province only. Never a postal code. */
  area: string;
  availability: Omit<StaffAvailability, "startDate">;
};

export type FullStaffProfile = Omit<LimitedStaffProfile, "view"> & {
  view: "full";
  availability: StaffAvailability;
  highlights: string;
  flags: MatchFlag[];
  lastName: string;
  email: string;
  phone: string;
  postalCode: string;
  radiusKm: number;
  certExpiresOn: string | null;
  firstAidExpiresOn: string | null;
  yearsExperience: number;
  careGroups: CareGroup[];
  languages: StaffLanguage[];
  hasResume: boolean;
};

export type CentreAccess = {
  /** The person applied to a job at this centre. */
  applied: boolean;
  /** The person accepted this centre's invite. */
  acceptedInvite: boolean;
  /** The person works at this centre on KidEase, or was hired here. */
  hired: boolean;
};

export function hasFullAccess(access: CentreAccess): boolean {
  return access.applied === true || access.acceptedInvite === true || access.hired === true;
}

/** The provider must be authorized for a centre with an explicit staff connection. */
export function mayReadStaffResume(isSelf: boolean, hiringCentreAccess: readonly CentreAccess[]): boolean {
  return isSelf || hiringCentreAccess.some(hasFullAccess);
}

export function profileFlags(profile: Pick<StaffProfileRecord, "certLevel" | "certExpiresOn" | "firstAidExpiresOn">, today: string): MatchFlag[] {
  const flags: MatchFlag[] = [];
  if (findCertLevel(profile.certLevel)) {
    const state = expiryState(profile.certExpiresOn, today);
    if (state === "expired") flags.push("cert_expired");
    if (state === "missing") flags.push("cert_missing_date");
  }
  if (expiryState(profile.firstAidExpiresOn, today) === "expired") flags.push("first_aid_expired");
  return flags;
}

export function generalArea(profile: Pick<StaffProfileRecord, "city" | "province">): string {
  const city = exactCity(profile.city);
  return city?.province === profile.province ? city.label : profile.province;
}

/**
 * Keep the limited preview to a first name, published certificate level, coarse
 * area and schedule. The opaque ref supports an invite, not document access.
 */
export function providerProfileView(
  profile: StaffProfileRecord,
  access: CentreAccess,
  today: string,
): LimitedStaffProfile | FullStaffProfile {
  const firstName = cleanName(profile.firstName);
  const limited: LimitedStaffProfile = {
    view: "limited",
    ref: profile.ref,
    firstName: /^[\p{L}\p{M} .'’-]+$/u.test(firstName) ? firstName : "",
    certLevel: findCertLevel(profile.certLevel)?.id ?? "",
    area: generalArea(profile),
    availability: {
      days: [...profile.days],
      shifts: [...profile.shifts],
      workTypes: [...profile.workTypes],
    },
  };
  if (!hasFullAccess(access)) return limited;
  return {
    ...limited,
    view: "full",
    firstName: profile.firstName,
    availability: { ...limited.availability, startDate: profile.startDate },
    highlights: profile.highlights,
    flags: profileFlags(profile, today),
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    postalCode: profile.postalCode,
    radiusKm: profile.radiusKm,
    certExpiresOn: profile.certExpiresOn,
    firstAidExpiresOn: profile.firstAidExpiresOn,
    yearsExperience: profile.yearsExperience,
    careGroups: [...profile.careGroups],
    languages: [...profile.languages],
    hasResume: profile.hasResume,
  };
}

/**
 * May this centre see the person at all (limited card in suggestions)?
 * - Applied or accepted an invite: yes. The person chose this centre.
 * - Paused or "only where I apply": no.
 * - Hidden from the current employer: no for that employer.
 */
export function visibleToCentre(input: {
  visibility: StaffVisibility;
  hideFromEmployer: boolean;
  isCurrentEmployer: boolean;
  access: CentreAccess;
}): boolean {
  if (input.access.applied || input.access.acceptedInvite) return true;
  if (input.isCurrentEmployer && input.hideFromEmployer) return false;
  return input.visibility === "open";
}

// ---------------------------------------------------------------------------
// Profile and job post checks
// ---------------------------------------------------------------------------

export const PROFILE_STEPS = ["name", "papers", "work", "where", "share"] as const;
export type ProfileStep = (typeof PROFILE_STEPS)[number];

export type ProfileDraft = {
  firstName: string;
  lastName: string;
  province: string;
  certLevel: string;
  certExpiresOn: string;
  firstAidExpiresOn: string;
  yearsExperience: string;
  careGroups: CareGroup[];
  days: StaffDay[];
  shifts: StaffShift[];
  workTypes: WorkType[];
  startDate: string;
  city: string;
  postalCode: string;
  radiusKm: number;
  languages: StaffLanguage[];
  highlights: string;
  phone: string;
  visibility: StaffVisibility;
  hideFromEmployer: boolean;
};

export type ProfileError =
  | "first_name"
  | "last_name"
  | "province"
  | "cert_date"
  | "days"
  | "work_type"
  | "city"
  | "postal_code";

export function profileStepErrors(step: ProfileStep, draft: ProfileDraft): ProfileError[] {
  const errors: ProfileError[] = [];
  if (step === "name") {
    if (!cleanName(draft.firstName)) errors.push("first_name");
    if (!cleanName(draft.lastName)) errors.push("last_name");
  }
  if (step === "papers") {
    if (!provinceCode(draft.province)) errors.push("province");
    if (findCertLevel(draft.certLevel) && !cleanDate(draft.certExpiresOn)) errors.push("cert_date");
  }
  if (step === "work") {
    if (!draft.days.length) errors.push("days");
    if (!draft.workTypes.length) errors.push("work_type");
  }
  if (step === "where") {
    if (!cleanText(draft.city, 80)) errors.push("city");
    if (draft.postalCode.trim() && !cleanPostalCode(draft.postalCode)) errors.push("postal_code");
  }
  return errors;
}

export const JOB_STEPS = ["role", "schedule", "centre"] as const;
export type JobStep = (typeof JOB_STEPS)[number];

export type JobDraft = {
  daycareId: string;
  title: string;
  certNeeded: string;
  careGroups: CareGroup[];
  days: StaffDay[];
  shifts: StaffShift[];
  workType: WorkType | "";
  startDate: string;
  payMin: string;
  payMax: string;
  about: string;
};

export type JobError = "centre" | "title" | "days" | "work_type" | "pay" | "pay_order" | "about";

/**
 * Pay range is required. BC, PEI, Newfoundland and Labrador and Ontario have
 * pay-transparency rules for job posts, so every post carries one.
 */
export function jobStepErrors(step: JobStep, draft: JobDraft): JobError[] {
  const errors: JobError[] = [];
  if (step === "role") {
    if (!draft.daycareId) errors.push("centre");
    if (cleanText(draft.title, JOB_TITLE_MAX).length < 2) errors.push("title");
  }
  if (step === "schedule") {
    if (!draft.days.length) errors.push("days");
    if (!draft.workType) errors.push("work_type");
    const min = payCents(draft.payMin);
    const max = payCents(draft.payMax);
    const lo = PAY_MIN_DOLLARS * 100;
    const hi = PAY_MAX_DOLLARS * 100;
    if (min === null || max === null || min < lo || max > hi || min > hi || max < lo) errors.push("pay");
    else if (min > max) errors.push("pay_order");
  }
  if (step === "centre") {
    if (cleanText(draft.about, JOB_ABOUT_MAX).length < 10) errors.push("about");
  }
  return errors;
}

export function profileComplete(draft: ProfileDraft): boolean {
  return PROFILE_STEPS.every((step) => profileStepErrors(step, draft).length === 0);
}

// ---------------------------------------------------------------------------
// Vetting checklist. The provider ticks each line. Nothing is automatic.
// ---------------------------------------------------------------------------

export type BackgroundCheckFact = { found: boolean; expiresOn: string | null } | null;

export type VettingHint =
  | "on_file"
  | "expires_soon"
  | "expired"
  | "missing"
  | "record_found"
  | "record_expired"
  | "no_record"
  | "records_off"
  | "ask";

export type VettingRow = { item: VettingItem; hint: VettingHint; date: string | null; state: VettingState; note: string };

export function vettingChecklist(input: {
  certLevel: string;
  certExpiresOn: string | null;
  firstAidExpiresOn: string | null;
  /** From the centre's background-check records, if that feature is in the database. */
  backgroundCheck: BackgroundCheckFact;
  saved: Partial<Record<VettingItem, { state: VettingState; note: string }>>;
  today: string;
}): VettingRow[] {
  const hintFor = (state: ExpiryState): VettingHint =>
    state === "expired" ? "expired" : state === "soon" ? "expires_soon" : state === "ok" ? "on_file" : "missing";
  const certState = findCertLevel(input.certLevel) ? expiryState(input.certExpiresOn, input.today) : "missing";
  const bg = input.backgroundCheck;
  const bgHint: VettingHint = !bg
    ? "records_off"
    : !bg.found
      ? "no_record"
      : expiryState(bg.expiresOn, input.today) === "expired"
        ? "record_expired"
        : "record_found";
  const rows: Omit<VettingRow, "state" | "note">[] = [
    { item: "certificate", hint: hintFor(certState), date: input.certExpiresOn },
    { item: "first_aid", hint: hintFor(expiryState(input.firstAidExpiresOn, input.today)), date: input.firstAidExpiresOn },
    { item: "background_check", hint: bgHint, date: bg?.expiresOn ?? null },
    { item: "references", hint: "ask", date: null },
  ];
  return rows.map((row) => ({
    ...row,
    state: pickVettingState(input.saved[row.item]?.state),
    note: cleanText(input.saved[row.item]?.note, 200),
  }));
}

export function vettingDone(rows: readonly VettingRow[]): number {
  return rows.filter((row) => row.state !== "to_do").length;
}

/**
 * Moving a stage is always the provider's choice. The board never sets
 * "not_selected" by itself, and "hired" needs a full profile (the person applied
 * or accepted an invite).
 */
export function canSetStage(input: { to: ApplicationStage; actor: "provider" | "system"; fullAccess: boolean }): boolean {
  if (input.actor === "system") return input.to === "viewed";
  if (input.to === "hired" || input.to === "offer" || input.to === "interview") return input.fullAccess;
  return true;
}
