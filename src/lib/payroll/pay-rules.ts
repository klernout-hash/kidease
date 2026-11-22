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
  /** General adult minimum wage per hour, in cents, and the date it started. */
  minimumWage: Verified<{ cents: number; since: string }>;
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
    // News reports say $17.95 from Oct 1, 2026. The ontario.ca minimum wage page we read still showed an old chart.
    minimumWage: no("https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage", "The official page we read showed an out-of-date chart."),
  },
  AB: {
    vacation: yes(FOUR_SIX, "https://www.alberta.ca/vacation-pay"),
    overtime: no("https://www.alberta.ca/overtime", NOT_READ),
    holiday: no("https://www.alberta.ca/general-holidays-pay", NOT_READ),
    minimumWage: no("https://www.alberta.ca/minimum-wage", "The official page gives $15 but no start date."),
  },
  BC: {
    vacation: yes(FOUR_SIX, "https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/time-off/vacation"),
    overtime: no("https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/hours-of-work-and-overtime/overtime", NOT_READ),
    holiday: no("https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/statutory-holidays", NOT_READ),
    minimumWage: yes({ cents: 1_825, since: "2026-06-01" }, "https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/wages/minimum-wage"),
  },
  MB: {
    // Manitoba: 4% for years 1 to 5, 6% once 5 years are complete.
    vacation: yes(FOUR_SIX, "https://www.gov.mb.ca/labour/standards/doc,vacations,factsheet.html"),
    overtime: yes({ dailyHours: 8, weeklyHours: 40, multiplier: 1.5 }, "https://www.gov.mb.ca/labour/standards/doc,overtime,factsheet.html"),
    holiday: no("https://www.gov.mb.ca/labour/standards/doc,general-holidays,factsheet.html", NOT_READ),
    minimumWage: yes({ cents: 1_640, since: "2026-10-01" }, "https://www.gov.mb.ca/labour/standards/doc,minimum-wage,factsheet.html"),
  },
  NB: {
    vacation: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards.html", "The official site blocks automated readers."),
    overtime: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards.html", "The official site blocks automated readers."),
    holiday: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards.html", "The official site blocks automated readers."),
    minimumWage: no("https://www2.gnb.ca/content/gnb/en/departments/post-secondary_education_training_and_labour/People/content/EmploymentStandards/MinimumWage.html", "The official site blocks automated readers."),
  },
  NL: {
    vacation: no("https://www.gov.nl.ca/ecc/labour/lra/", NOT_READ),
    overtime: no("https://www.gov.nl.ca/ecc/labour/lra/", NOT_READ),
    holiday: no("https://www.gov.nl.ca/ecc/labour/lra/", NOT_READ),
    minimumWage: no("https://www.gov.nl.ca/ecc/labour/lsminimumwage/", NOT_READ),
  },
  NS: {
    vacation: no("https://novascotia.ca/lae/employmentrights/vacationpay.asp", NOT_READ),
    overtime: no("https://novascotia.ca/lae/employmentrights/hoursofwork.asp", NOT_READ),
    holiday: no("https://novascotia.ca/lae/employmentrights/holidaysandvacation.asp", NOT_READ),
    minimumWage: yes({ cents: 1_700, since: "2026-10-01" }, "https://novascotia.ca/lae/employmentrights/minimumwage.asp"),
  },
  NT: {
    vacation: no("https://www.ece.gov.nt.ca/en/services/employment-standards", NOT_READ),
    overtime: no("https://www.ece.gov.nt.ca/en/services/employment-standards", NOT_READ),
    holiday: no("https://www.ece.gov.nt.ca/en/services/employment-standards", NOT_READ),
    minimumWage: no("https://www.ece.gov.nt.ca/en/services/employment-standards/minimum-wage", "The official page we read showed a 2021 rate, which looks out of date."),
  },
  NU: {
    vacation: no("https://nu-lsco.ca/", NOT_READ),
    overtime: no("https://nu-lsco.ca/", NOT_READ),
    holiday: no("https://nu-lsco.ca/", NOT_READ),
    minimumWage: no("https://nu-lsco.ca/", NOT_READ),
  },
  PE: {
    vacation: no("https://www.princeedwardisland.ca/en/topic/employment-standards", NOT_READ),
    overtime: no("https://www.princeedwardisland.ca/en/topic/employment-standards", NOT_READ),
    holiday: no("https://www.princeedwardisland.ca/en/topic/employment-standards", NOT_READ),
    minimumWage: no("https://www.princeedwardisland.ca/en/information/economic-development-workforce-and-labour/minimum-wage-order", NOT_READ),
  },
  QC: {
    vacation: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/leave/annual-vacation", NOT_READ),
    overtime: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/hours-work/overtime", NOT_READ),
    holiday: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/leave/statutory-holidays", NOT_READ),
    minimumWage: no("https://www.cnesst.gouv.qc.ca/en/working-conditions/wages-pay/minimum-wage", NOT_READ),
  },
  SK: {
    vacation: no("https://www.saskatchewan.ca/business/employment-standards", NOT_READ),
    overtime: no("https://www.saskatchewan.ca/business/employment-standards", NOT_READ),
    holiday: no("https://www.saskatchewan.ca/business/employment-standards", NOT_READ),
    minimumWage: no("https://www.saskatchewan.ca/business/employment-standards/wages-and-pay/minimum-wage", NOT_READ),
  },
  YT: {
    vacation: no("https://yukon.ca/en/employment-standards", NOT_READ),
    overtime: no("https://yukon.ca/en/employment-standards", NOT_READ),
    holiday: no("https://yukon.ca/en/employment-standards", NOT_READ),
    minimumWage: no("https://yukon.ca/en/minimum-wage", NOT_READ),
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

/** Minimum wage in cents on a date, or null when not verified or not yet in force. */
export function minimumWageCents(province: Province, onDate: string): number | null {
  const rule = PAY_RULES[province].minimumWage;
  if (!rule.verified) return null;
  if (onDate < rule.value.since) return null;
  return rule.value.cents;
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
    for (const key of ["vacation", "overtime", "holiday", "minimumWage"] as const) {
      const rule = rules[key];
      if (!rule.verified) out.push({ province, rule: key, source: rule.source, why: rule.why });
    }
  }
  return out;
}
