/**
 * Fee-reduction preview for participating centres.
 * KidEase does not submit this to a government system.
 */

export const CWELCC_DISCLAIMER =
  "KidEase is not government-affiliated. Confirm these figures with your service system manager. KidEase does not submit this to the government.";

export const ONTARIO_DAILY_CAP_CENTS = 2200;
export const BC_TEN_DOLLAR_CAP_CENTS = 1000;

export type CwelccProvince = "ON" | "BC" | "AB";

export const CWELCC_PROVINCES: CwelccProvince[] = ["ON", "BC", "AB"];

export function isCwelccProvince(value: string): value is CwelccProvince {
  return value === "ON" || value === "BC" || value === "AB";
}

export type DailyFeeInput = {
  province: CwelccProvince;
  participating: boolean;
  eligible: boolean;
  fullDailyCents: number;
  /** Ontario only. The fee on December 31, 2024, when the centre has it. */
  feeOn2024_12_31Cents?: number | null;
  /** British Columbia $10-a-day site. Off unless the centre says so. */
  tenDollarSite?: boolean;
  /** British Columbia or Alberta reduction the centre enters. */
  enteredReductionCents?: number;
};

export type DailyFee = {
  parentCents: number;
  reductionCents: number;
  capAppliedCents: number | null;
};

function nonNeg(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/** Parent daily fee. Ineligible children pay the full fee. */
export function cwelccDailyFee(input: DailyFeeInput): DailyFee {
  const full = nonNeg(input.fullDailyCents);
  if (!input.participating || !input.eligible) {
    return { parentCents: full, reductionCents: 0, capAppliedCents: null };
  }
  if (input.province === "ON") {
    const prior = input.feeOn2024_12_31Cents;
    const ceiling =
      prior != null && Number.isFinite(prior) && nonNeg(prior) < ONTARIO_DAILY_CAP_CENTS
        ? nonNeg(prior)
        : ONTARIO_DAILY_CAP_CENTS;
    const parent = Math.min(full, ceiling);
    return { parentCents: parent, reductionCents: full - parent, capAppliedCents: ceiling };
  }
  if (input.province === "BC" && input.tenDollarSite) {
    const parent = Math.min(full, BC_TEN_DOLLAR_CAP_CENTS);
    return { parentCents: parent, reductionCents: full - parent, capAppliedCents: BC_TEN_DOLLAR_CAP_CENTS };
  }
  const reduction = Math.min(full, nonNeg(input.enteredReductionCents));
  return { parentCents: full - reduction, reductionCents: reduction, capAppliedCents: null };
}

export type SubsidySplit = {
  parentFeeCents: number;
  provincialCents: number;
  municipalCents: number;
  parentOwingCents: number;
};

/** Provincial and municipal subsidies stay separate from the fee reduction. */
export function applySubsidies(parentFeeCents: number, provincialCents: number, municipalCents: number): SubsidySplit {
  const parentFee = nonNeg(parentFeeCents);
  const provincial = nonNeg(provincialCents);
  const municipal = nonNeg(municipalCents);
  return {
    parentFeeCents: parentFee,
    provincialCents: provincial,
    municipalCents: municipal,
    parentOwingCents: Math.max(0, parentFee - provincial - municipal),
  };
}

export type FamilyShare = { key: string; bps: number };

/** Two households split the parent amount. Shares must add to 100%. */
export function splitFamilyBill(
  parentOwingCents: number,
  shares: FamilyShare[],
): { ok: true; parts: { key: string; cents: number }[] } | { ok: false } {
  const total = shares.reduce((sum, share) => sum + Math.round(share.bps), 0);
  if (shares.length < 2 || total !== 10000) return { ok: false };
  const owing = nonNeg(parentOwingCents);
  let used = 0;
  const parts = shares.map((share, index) => {
    if (index === shares.length - 1) return { key: share.key, cents: owing - used };
    const cents = Math.round((owing * Math.round(share.bps)) / 10000);
    used += cents;
    return { key: share.key, cents };
  });
  return { ok: true, parts };
}

export type AttendanceMark = "present" | "absent" | "closed";

export function recordOfAttendance(days: AttendanceMark[], allowanceDays: number | null) {
  const present = days.filter((day) => day === "present").length;
  const absent = days.filter((day) => day === "absent").length;
  const closed = days.filter((day) => day === "closed").length;
  const allowance = allowanceDays == null ? null : Math.max(0, Math.round(allowanceDays));
  return {
    present,
    absent,
    closed,
    allowanceDays: allowance,
    allowanceUsed: allowance == null ? absent : Math.min(absent, allowance),
    overAllowance: allowance == null ? 0 : Math.max(0, absent - allowance),
  };
}

/** A second person must sign. The same person cannot sign both lines. */
export function attendanceSignOffReady(firstUserId: string, secondUserId: string): boolean {
  const first = firstUserId.trim();
  const second = secondUserId.trim();
  return Boolean(first && second && first !== second);
}

export type AgeGroup = "infant" | "toddler" | "preschool" | "kindergarten" | "school_age";

export function ageGroupFromMonths(months: number): AgeGroup {
  const age = Math.max(0, Math.round(months));
  if (age < 18) return "infant";
  if (age < 30) return "toddler";
  if (age < 72) return "preschool";
  if (age < 84) return "kindergarten";
  return "school_age";
}

export type SummaryChild = { ageGroup: AgeGroup; parentCents: number; reductionCents: number };

export function monthlySummaryByAge(children: SummaryChild[]) {
  const groups: AgeGroup[] = ["infant", "toddler", "preschool", "kindergarten", "school_age"];
  return groups.map((ageGroup) => {
    const rows = children.filter((child) => child.ageGroup === ageGroup);
    return {
      ageGroup,
      children: rows.length,
      parentCents: rows.reduce((sum, row) => sum + nonNeg(row.parentCents), 0),
      reductionCents: rows.reduce((sum, row) => sum + nonNeg(row.reductionCents), 0),
    };
  });
}

export function yearEndReceipt(parentCents: number[]): number {
  return parentCents.reduce((sum, cents) => sum + nonNeg(cents), 0);
}

export type OccmsRow = {
  child: string;
  ageGroup: AgeGroup;
  present: number;
  absent: number;
  fullCents: number;
  reductionCents: number;
  parentCents: number;
  provincialCents: number;
  municipalCents: number;
};

/** Printable rows. This is not an OCCMS upload. */
export function occmsPrintable(rows: OccmsRow[]): string {
  const header = [
    CWELCC_DISCLAIMER,
    "Child | Age group | Present | Absent | Full fee | Reduction | Parent fee | Provincial subsidy | Municipal subsidy",
  ];
  const body = rows.map((row) =>
    [
      row.child,
      row.ageGroup,
      row.present,
      row.absent,
      row.fullCents,
      row.reductionCents,
      row.parentCents,
      row.provincialCents,
      row.municipalCents,
    ].join(" | "),
  );
  return [...header, ...body].join("\n");
}
