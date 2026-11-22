/**
 * Pay rules per province: vacation pay, public holiday pay, overtime, and
 * minimum wage.
 *
 * A rule is `verified: true` only when we read it on the province's own
 * official page on the as-of date. An unverified rule keeps its link but has
 * no number we turn into dollars. The owner sees "Check the official page".
 */

import type { Province } from "./tables.ts";

export const RULES_AS_OF = "2026-11-22";

export type Verified<T> =
  | { verified: true; value: T; source: string; asOf: string }
  | { verified: false; value: null; source: string; asOf: string; why: string };

export type VacationTier = { fromYears: number; bps: number };
export type OvertimeRule = { dailyHours: number | null; weeklyHours: number; multiplier: number };
export type HolidayRule = { formulaEn: string; formulaFr: string; divisor: number | null; weeksBack: number | null };

export type ProvinceRules = {
  vacation: Verified<readonly VacationTier[]>;
  overtime: Verified<OvertimeRule>;
  holiday: Verified<HolidayRule>;
};

function yes<T>(value: T, source: string): Verified<T> {
  return { verified: true, value, source, asOf: RULES_AS_OF };
}

function no<T>(source: string, why: string): Verified<T> {
  return { verified: false, value: null, source, asOf: RULES_AS_OF, why };
}

const NOT_READ = "We could not read this on the official page on the as-of date.";
const FOUR_SIX: readonly VacationTier[] = [
  { fromYears: 0, bps: 400 },
  { fromYears: 5, bps: 600 },
];

export const PAY_RULES: Record<Province, ProvinceRules> = {
  ON: {
    vacation: yes(FOUR_SIX, "https://www.ontario.ca/document/your-guide-employment-standards-act-0/vacation"),
    overtime: yes({ dailyHours: null, weeklyHours: 44, multiplier: 1.5 }, "https://www.ontario.ca/document/your-guide-employment-standards-act-0/overtime-pay"),
    holiday: yes(
      {
        formulaEn: "Regular wages plus vacation pay from the 4 work weeks before the holiday week, divided by 20.",
        formulaFr: "Salaire normal plus paie de vacances des 4 semaines avant la semaine du congé, divisé par 20.",
        divisor: 20,
        weeksBack: 4,
      },
      "https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays",
    ),
  },
  AB: {
    vacation: yes(FOUR_SIX, "https://www.alberta.ca/vacation-pay"),
    overtime: no("https://www.alberta.ca/overtime", NOT_READ),
    holiday: no("https://www.alberta.ca/general-holidays-pay", NOT_READ),
  },
  BC: {
    vacation: yes(FOUR_SIX, "https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/time-off/vacation"),
    overtime: no("https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/hours-of-work-and-overtime/overtime", NOT_READ),
    holiday: no("https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/statutory-holidays", NOT_READ),
  },
  MB: {
    // Manitoba: 4% for years 1 to 5, 6% once 5 years are complete.
    vacation: yes(FOUR_SIX, "https://www.gov.mb.ca/labour/standards/doc,vacations,factsheet.html"),
    overtime: yes({ dailyHours: 8, weeklyHours: 40, multiplier: 1.5 }, "https://www.gov.mb.ca/labour/standards/doc,overtime,factsheet.html"),
    holiday: no("https://www.gov.mb.ca/labour/standards/doc,general-holidays,factsheet.html", NOT_READ),
  },
  NB: {
    vacation: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards.html", "The official site blocks automated readers."),
    overtime: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards.html", "The official site blocks automated readers."),
    holiday: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards.html", "The official site blocks automated readers."),
  },
  NL: {
    vacation: no("https://www.gov.nl.ca/ecc/labour/lra/", NOT_READ),
    overtime: no("https://www.gov.nl.ca/ecc/labour/lra/", NOT_READ),
    holiday: no("https://www.gov.nl.ca/ecc/labour/lra/", NOT_READ),
  },
  NS: {
    vacation: no("https://novascotia.ca/lae/employmentrights/vacationpay.asp", NOT_READ),
    overtime: no("https://novascotia.ca/lae/employmentrights/hoursofwork.asp", NOT_READ),
    holiday: no("https://novascotia.ca/lae/employmentrights/holidaysandvacation.asp", NOT_READ),
  },
  NT: {
    vacation: no("https://www.ece.gov.nt.ca/en/services/employment-standards", NOT_READ),
    overtime: no("https://www.ece.gov.nt.ca/en/services/employment-standards", NOT_READ),
    holiday: no("https://www.ece.gov.nt.ca/en/services/employment-standards", NOT_READ),
  },
  NU: {
    vacation: no("https://nu-lsco.ca/", NOT_READ),
    overtime: no("https://nu-lsco.ca/", NOT_READ),
    holiday: no("https://nu-lsco.ca/", NOT_READ),
  },
  PE: {
    vacation: no("https://www.princeedwardisland.ca/en/topic/employment-standards", NOT_READ),
    overtime: no("https://www.princeedwardisland.ca/en/topic/employment-standards", NOT_READ),
    holiday: no("https://www.princeedwardisland.ca/en/topic/employment-standards", NOT_READ),
  },
  QC: {
    vacation: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/leave/annual-vacation", NOT_READ),
    overtime: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/hours-work/overtime", NOT_READ),
    holiday: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/leave/statutory-holidays", NOT_READ),
  },
  SK: {
    vacation: no("https://www.saskatchewan.ca/business/employment-standards", NOT_READ),
    overtime: no("https://www.saskatchewan.ca/business/employment-standards", NOT_READ),
    holiday: no("https://www.saskatchewan.ca/business/employment-standards", NOT_READ),
  },
  YT: {
    vacation: no("https://yukon.ca/en/employment-standards", NOT_READ),
    overtime: no("https://yukon.ca/en/employment-standards", NOT_READ),
    holiday: no("https://yukon.ca/en/employment-standards", NOT_READ),
  },
};

/** Whole years of service on a date. */
export function yearsOfService(hireDate: string | null | undefined, onDate: string): number | null {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate) || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return null;
  const [hy, hm, hd] = hireDate.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  let years = y - hy;
  if (m < hm || (m === hm && d < hd)) years -= 1;
  return Math.max(0, years);
}

/**
 * Vacation pay percent (basis points) the law asks for, or null when the rule
 * is not verified or the hire date is missing. The owner can always pay more.
 */
export function minimumVacationBps(province: Province, hireDate: string | null | undefined, onDate: string): number | null {
  const rule = PAY_RULES[province].vacation;
  if (!rule.verified) return null;
  const years = yearsOfService(hireDate, onDate);
  if (years == null) return null;
  let bps = 0;
  for (const tier of rule.value) if (years >= tier.fromYears) bps = tier.bps;
  return bps;
}

/**
 * General hourly minimum wage, by province, with history so a past date still
 * resolves. Research done 2026-11-22 from government pages and releases.
 * `from: null` means "in force before the next change; start date not recorded".
 * Rates change, usually once a year. Re-check each spring and fall.
 */
export const MINIMUM_WAGE_AS_OF = "2026-11-22";

export type WageStep = { cents: number; from: string | null; announced?: boolean };
export type WageClass = "general" | "student" | "tipped";

export type MinimumWageRule = {
  source: string;
  /** Where the latest change was announced, when the link is a department page. */
  sourceNote?: string;
  general: readonly WageStep[];
  /** Special rates. Never applied unless the owner marks the person (student: ON and AB only). */
  student?: readonly WageStep[];
  tipped?: readonly WageStep[];
};

export const MINIMUM_WAGES: Record<Province, MinimumWageRule> = {
  AB: { source: "https://www.alberta.ca/minimum-wage", general: [{ cents: 1_500, from: "2018-10-01" }], student: [{ cents: 1_300, from: null }] },
  BC: { source: "https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/wages/minimum-wage", general: [{ cents: 1_785, from: null }, { cents: 1_825, from: "2026-06-01" }] },
  MB: { source: "https://www.gov.mb.ca/labour/standards/doc,minimum-wage,factsheet.html", general: [{ cents: 1_600, from: null }, { cents: 1_640, from: "2026-10-01" }] },
  NB: { source: "https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards/MinimumWage.html", general: [{ cents: 1_565, from: null }, { cents: 1_590, from: "2026-04-01" }] },
  NL: { source: "https://www.gov.nl.ca/releases/", sourceNote: "Government of NL news release, 2026-02-26", general: [{ cents: 1_600, from: null }, { cents: 1_635, from: "2026-04-01" }] },
  NS: { source: "https://novascotia.ca/lae/employmentrights/minimumwage.asp", general: [{ cents: 1_675, from: "2026-04-01" }, { cents: 1_700, from: "2026-10-01" }] },
  ON: { source: "https://www.ontario.ca/minimumwage", general: [{ cents: 1_760, from: null }, { cents: 1_795, from: "2026-10-01" }], student: [{ cents: 1_690, from: "2026-10-01" }] },
  PE: {
    source: "https://www.princeedwardisland.ca/en/information/economic-development-workforce-and-labour/minimum-wage-order",
    general: [
      { cents: 1_700, from: "2026-04-01" },
      { cents: 1_730, from: "2026-10-01" },
      { cents: 1_760, from: "2027-04-01", announced: true },
    ],
  },
  QC: { source: "https://www.cnesst.gouv.qc.ca/en/working-conditions/wages-pay/minimum-wage", general: [{ cents: 1_610, from: null }, { cents: 1_660, from: "2026-05-01" }], tipped: [{ cents: 1_330, from: "2026-05-01" }] },
  SK: { source: "https://www.saskatchewan.ca/government/news-and-media", sourceNote: "Saskatchewan news release, 2026-06-29", general: [{ cents: 1_535, from: null }, { cents: 1_570, from: "2026-10-01" }] },
  YT: { source: "https://yukon.ca/en/find-minimum-wage-yukon", general: [{ cents: 1_794, from: null }, { cents: 1_851, from: "2026-04-01" }] },
  NT: { source: "https://www.gov.nt.ca/en/newsroom", sourceNote: "GNWT public service announcement, 2026-07-31", general: [{ cents: 1_695, from: null }, { cents: 1_720, from: "2026-09-01" }] },
  NU: { source: "https://www.gov.nu.ca/en/newsroom", sourceNote: "Government of Nunavut announcement (Sept 1, 2026 rate)", general: [{ cents: 1_975, from: null }, { cents: 2_017, from: "2026-09-01" }] },
};

function stepOn(steps: readonly WageStep[] | undefined, onDate: string): WageStep | null {
  if (!steps?.length) return null;
  let found: WageStep | null = null;
  for (const step of steps) {
    if (step.from == null || step.from <= onDate) found = step;
  }
  // Before the first known start date, only a step with an unknown start (null) applies.
  return found;
}

/** Minimum wage in force on the day the hours were worked, or null when no rate is known for that day. */
export function minimumWageOn(province: Province, workDate: string, wageClass: WageClass = "general"): { cents: number; from: string | null; wageClass: WageClass } | null {
  const rule = MINIMUM_WAGES[province];
  const special = wageClass === "student" && (province === "ON" || province === "AB") ? rule.student : wageClass === "tipped" ? rule.tipped : undefined;
  const pickSpecial = special ? stepOn(special, workDate) : null;
  if (pickSpecial) return { cents: pickSpecial.cents, from: pickSpecial.from, wageClass };
  const step = stepOn(rule.general, workDate);
  return step ? { cents: step.cents, from: step.from, wageClass: "general" } : null;
}

/** Kept for callers that want only cents. */
export function minimumWageCents(province: Province, onDate: string): number | null {
  return minimumWageOn(province, onDate)?.cents ?? null;
}

export type DayMinutes = { date: string; minutes: number };

/**
 * Split worked minutes into regular and overtime with the province rule.
 * Daily overtime is counted first, then weekly overtime on the regular hours left.
 * Days must be one work week. Unverified provinces return no overtime and say so.
 */
export function splitOvertime(province: Province, days: readonly DayMinutes[]): {
  regularMinutes: number;
  overtimeMinutes: number;
  multiplier: number | null;
  verified: boolean;
} {
  const rule = PAY_RULES[province].overtime;
  const total = days.reduce((sum, day) => sum + Math.max(0, day.minutes), 0);
  if (!rule.verified) return { regularMinutes: total, overtimeMinutes: 0, multiplier: null, verified: false };
  let daily = 0;
  let regular = 0;
  for (const day of days) {
    const minutes = Math.max(0, day.minutes);
    if (rule.value.dailyHours != null && minutes > rule.value.dailyHours * 60) {
      daily += minutes - rule.value.dailyHours * 60;
      regular += rule.value.dailyHours * 60;
    } else {
      regular += minutes;
    }
  }
  const weeklyCap = rule.value.weeklyHours * 60;
  const weekly = Math.max(0, regular - weeklyCap);
  return {
    regularMinutes: regular - weekly,
    overtimeMinutes: daily + weekly,
    multiplier: rule.value.multiplier,
    verified: true,
  };
}

/** Public holiday pay where the formula is verified (Ontario: last 4 weeks / 20). */
export function holidayPayCents(province: Province, wagesLastWeeksCents: number, vacationLastWeeksCents: number): number | null {
  const rule = PAY_RULES[province].holiday;
  if (!rule.verified || rule.value.divisor == null) return null;
  return Math.round((Math.max(0, wagesLastWeeksCents) + Math.max(0, vacationLastWeeksCents)) / rule.value.divisor);
}

/** Every rule that is not verified, for the report and the owner's "check these" list. */
export function unverifiedRules(): { province: Province; rule: keyof ProvinceRules; source: string; why: string }[] {
  const out: { province: Province; rule: keyof ProvinceRules; source: string; why: string }[] = [];
  for (const [province, rules] of Object.entries(PAY_RULES) as [Province, ProvinceRules][]) {
    for (const key of ["vacation", "overtime", "holiday"] as const) {
      const rule = rules[key];
      if (!rule.verified) out.push({ province, rule: key, source: rule.source, why: rule.why });
    }
  }
  return out;
}
