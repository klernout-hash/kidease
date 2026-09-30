/**
 * The licensed day. Pure. KidEase records who was here and what each side
 * owes. It does not pay a subsidy, and it is not the licensing authority.
 *
 * Centre ratios only. A family child care home uses a different table.
 * Provinces without a row here show the centre's own capacity and no ratio.
 */

export const RATIO_AGE_GROUPS = ["infant", "toddler", "preschool", "school_age"] as const;
export type RatioAgeGroup = (typeof RATIO_AGE_GROUPS)[number];

export const PROGRAM_KINDS = ["cwelcc", "subsidy", "none"] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export type RatioRule = {
  staff: number;
  children: number;
  maxGroup: number;
  band: string;
  citation: string;
  note: string;
};

const CENTRE_ONLY = "Licensed child care centre. Not a family or group home ratio.";

/** Man. Reg. 62/86, s. 8. Separate-age rows where a room is one band; mixed-age for 2–6 and school age. */
const MB: Record<RatioAgeGroup, RatioRule> = {
  infant: {
    staff: 1,
    children: 3,
    maxGroup: 6,
    band: "12 weeks–1 year",
    citation: "Man. Reg. 62/86, s. 8(2)(b)",
    note: `${CENTRE_ONLY} If this room runs mixed ages through age 2, the mixed row is 1:4, maximum 8.`,
  },
  toddler: {
    staff: 1,
    children: 4,
    maxGroup: 8,
    band: "1 year–2 years",
    citation: "Man. Reg. 62/86, s. 8(2)(b)",
    note: CENTRE_ONLY,
  },
  preschool: {
    staff: 1,
    children: 8,
    maxGroup: 16,
    band: "2–6 years, mixed-age",
    citation: "Man. Reg. 62/86, s. 8(2)(a)",
    note: `${CENTRE_ONLY} A room that is only 2–3 years uses 1:6, maximum 12.`,
  },
  school_age: {
    staff: 1,
    children: 15,
    maxGroup: 30,
    band: "6–12 years",
    citation: "Man. Reg. 62/86, s. 8(2)(a)",
    note: CENTRE_ONLY,
  },
};

/** O. Reg. 137/15, Schedule 1. Infant is 3 staff for 10 children, not 1:3. School age here is primary/junior, not kindergarten. */
const ON: Record<RatioAgeGroup, RatioRule> = {
  infant: {
    staff: 3,
    children: 10,
    maxGroup: 10,
    band: "Under 18 months",
    citation: "O. Reg. 137/15, Schedule 1",
    note: `${CENTRE_ONLY} Reduced ratios are not allowed for infants.`,
  },
  toddler: {
    staff: 1,
    children: 5,
    maxGroup: 15,
    band: "18–30 months",
    citation: "O. Reg. 137/15, Schedule 1",
    note: CENTRE_ONLY,
  },
  preschool: {
    staff: 1,
    children: 8,
    maxGroup: 24,
    band: "30 months–6 years",
    citation: "O. Reg. 137/15, Schedule 1",
    note: CENTRE_ONLY,
  },
  school_age: {
    staff: 1,
    children: 15,
    maxGroup: 30,
    band: "Primary/junior school age",
    citation: "O. Reg. 137/15, Schedule 1",
    note: `${CENTRE_ONLY} Kindergarten is 1:13, maximum 26. This row is not kindergarten.`,
  },
};

const RATIOS: Record<string, Record<RatioAgeGroup, RatioRule>> = { MB, ON };

export function isRatioAgeGroup(value: string | null | undefined): value is RatioAgeGroup {
  return (RATIO_AGE_GROUPS as readonly string[]).includes((value || "").trim());
}

export function isProgramKind(value: string | null | undefined): value is ProgramKind {
  return (PROGRAM_KINDS as readonly string[]).includes((value || "").trim());
}

export function ratioRule(province: string | null | undefined, ageGroup: string | null | undefined): RatioRule | null {
  const table = RATIOS[(province || "").trim().toUpperCase()];
  if (!table || !isRatioAgeGroup(ageGroup)) return null;
  return table[ageGroup];
}

/** Staff the row requires for this many children in the room right now. Zero children needs zero staff. */
export function staffRequired(present: number, rule: RatioRule): number {
  const n = Math.max(0, Math.floor(present));
  if (n === 0) return 0;
  return Math.ceil((n * rule.staff) / rule.children);
}

export type RoomRatio = {
  rule: RatioRule | null;
  staffRequired: number;
  groupMax: number;
  overRatio: boolean;
  overGroup: boolean;
};

/**
 * Children marked arrived count. Sick, vacation, absent, and not-yet-in do not.
 * Group max is the tighter of the centre's capacity and the regulation maximum.
 * No loaded ratio means capacity only — never an invented staff number.
 */
export function evaluateRoom(input: {
  province?: string | null;
  ageGroup?: string | null;
  present: number;
  staff: number;
  capacity: number;
}): RoomRatio {
  const present = Math.max(0, Math.floor(input.present));
  const staff = Math.max(0, Math.floor(input.staff));
  const capacity = Math.max(0, Math.floor(input.capacity));
  const rule = ratioRule(input.province, input.ageGroup);
  const required = rule ? staffRequired(present, rule) : 0;
  const groupMax = rule ? Math.min(capacity, rule.maxGroup) : capacity;
  return {
    rule,
    staffRequired: required,
    groupMax,
    overRatio: Boolean(rule) && staff < required,
    overGroup: present > groupMax,
  };
}

export type DayBucket = "present" | "absent" | "sick" | "vacation" | "unmarked";

/** A day the child was here. Picked up still counts — they attended. */
export function dayBucket(status: string | null | undefined): DayBucket {
  if (status === "arrived" || status === "departed") return "present";
  if (status === "absent") return "absent";
  if (status === "sick") return "sick";
  if (status === "vacation") return "vacation";
  return "unmarked";
}

export function countsAsPresent(status: string | null | undefined): boolean {
  return dayBucket(status) === "present";
}

export type MonthLedger = {
  present: number;
  absent: number;
  sick: number;
  vacation: number;
  unmarked: number;
  parentCents: number;
  programCents: number;
};

const MAX_DAILY_CENTS = 50_000;

export function dollarsToDailyCents(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    const cents = Math.round(raw * 100);
    return cents <= MAX_DAILY_CENTS ? cents : null;
  }
  const text = String(raw ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  if (cents < 0 || cents > MAX_DAILY_CENTS) return null;
  return cents;
}

export function normalizeSplit(input: {
  parentDailyCents: number;
  programDailyCents: number;
  programKind: string;
  programLabel?: string | null;
}): { parentDailyCents: number; programDailyCents: number; programKind: ProgramKind; programLabel: string } | null {
  if (!isProgramKind(input.programKind)) return null;
  const parent = Math.floor(input.parentDailyCents);
  const program = input.programKind === "none" ? 0 : Math.floor(input.programDailyCents);
  if (parent < 0 || parent > MAX_DAILY_CENTS || program < 0 || program > MAX_DAILY_CENTS) return null;
  return {
    parentDailyCents: parent,
    programDailyCents: program,
    programKind: input.programKind,
    programLabel: String(input.programLabel ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
  };
}

/**
 * Parent share and program share use days the child was here.
 * Sick, vacation, and absent stay on the record and are not added.
 * The centre confirms which absences its province pays. KidEase does not.
 */
export function buildMonthLedger(input: {
  statuses: Array<string | null | undefined>;
  parentDailyCents: number;
  programDailyCents: number;
}): MonthLedger {
  const counts: MonthLedger = {
    present: 0,
    absent: 0,
    sick: 0,
    vacation: 0,
    unmarked: 0,
    parentCents: 0,
    programCents: 0,
  };
  for (const status of input.statuses) counts[dayBucket(status)] += 1;
  const parent = Math.max(0, Math.floor(input.parentDailyCents));
  const program = Math.max(0, Math.floor(input.programDailyCents));
  counts.parentCents = counts.present * parent;
  counts.programCents = counts.present * program;
  return counts;
}

/** Whole dollars for the existing parent bill. Never more than the share. Under a dollar is not a bill. */
export function parentShareDollars(parentCents: number): number | null {
  const dollars = Math.floor(Math.max(0, parentCents) / 100);
  return dollars >= 1 ? dollars : null;
}

export function canWriteDayNote(status: string | null | undefined): boolean {
  return status === "arrived" || status === "departed" || status === "absent" || status === "sick" || status === "vacation";
}

export function dayNoteReady(input: { food?: string; nap?: string; incident?: string; photo?: string }): boolean {
  const food = (input.food || "").trim();
  const nap = (input.nap || "").trim();
  const incident = (input.incident || "").trim();
  const photo = (input.photo || "").trim();
  if (food.length > 500 || nap.length > 500 || incident.length > 2000) return false;
  return Boolean(food || nap || incident || photo);
}
