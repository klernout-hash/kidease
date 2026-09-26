/**
 * Sourced fee programs. A program is a provincial daily cap this centre is in.
 * It is not a monthly CAD amount. Never convert a daily cap into infant_monthly
 * or any other monthly integer (the harvested catalogue used 218 for that guess).
 * A province-wide assumption is not a program. Harvested "funded" / "ten-a-day"
 * amenities are not a program until this centre has a sourced fee_program value.
 */

export const MB_FUNDED_10_DAY = "mb-10-day" as const;

export const FEE_PROGRAMS = {
  [MB_FUNDED_10_DAY]: {
    province: "MB",
    badge: "badgeTen",
  },
} as const;

export type FeeProgramCode = keyof typeof FEE_PROGRAMS;
export type FeeProgramBadge = (typeof FEE_PROGRAMS)[FeeProgramCode]["badge"];

const ALIASES: Record<string, FeeProgramCode> = {
  "mb-10-day": MB_FUNDED_10_DAY,
  "mb-funded": MB_FUNDED_10_DAY,
  "mb funded": MB_FUNDED_10_DAY,
  "manitoba-funded": MB_FUNDED_10_DAY,
  "manitoba funded": MB_FUNDED_10_DAY,
  "mb funded / max regulated daily $10/day": MB_FUNDED_10_DAY,
  "manitoba funded / max regulated daily $10/day": MB_FUNDED_10_DAY,
  "max regulated daily $10/day": MB_FUNDED_10_DAY,
};

/** Harvested catalogue conversion of a Manitoba $10 day into a fake monthly fee. */
export const CATALOGUE_MONTHLY_FEE_GUESS = 218;

function programKey(raw?: string | null) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeFeeProgram(raw?: string | null): FeeProgramCode | null {
  const key = programKey(raw);
  if (!key) return null;
  return ALIASES[key] ?? null;
}

export function confirmedStoredFeeProgram(d: {
  feeProgram?: string | null;
  province?: string | null;
}): FeeProgramCode | null {
  const code = normalizeFeeProgram(d.feeProgram);
  if (!code) return null;
  const province = (d.province || "").trim().toUpperCase();
  if (province !== FEE_PROGRAMS[code].province) return null;
  return code;
}

function hasAmenity(amenities: string, key: string) {
  return amenities
    .split(",")
    .map((part) => part.trim())
    .includes(key);
}

export function hasListedMonthlyFees(d: {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
}) {
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].some(
    (n) => n != null && n > 0,
  );
}

/**
 * Listed monthly fee, a sourced fee program, or a per-centre program amenity
 * after this centre confirmed fees. A province-typical $10-a-day guess is not enough.
 */
export function hasConfirmedFeeLine(d: {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  amenities?: string | null;
  feeConfirmed?: boolean | null;
  feeProgram?: string | null;
  province?: string | null;
}): boolean {
  if (hasListedMonthlyFees(d)) return true;
  if (confirmedStoredFeeProgram(d)) return true;
  if (!d.feeConfirmed) return false;
  const amenities = d.amenities || "";
  return hasAmenity(amenities, "ten-a-day") || hasAmenity(amenities, "funded");
}

/**
 * $10-a-day / $15-a-day / Québec reduced badge only for this centre.
 * A sourced fee program counts without a claim. Harvested amenities do not.
 * Québec is never stamped $10-a-day.
 */
export function confirmedFeeProgramBadge(d: {
  province?: string | null;
  amenities?: string | null;
  feeConfirmed?: boolean | null;
  feeProgram?: string | null;
}): FeeProgramBadge | "badgeFifteen" | "badgeReducedQc" | null {
  const stored = confirmedStoredFeeProgram(d);
  if (stored) return FEE_PROGRAMS[stored].badge;
  if (!d.feeConfirmed) return null;
  const amenities = d.amenities || "";
  const ten = hasAmenity(amenities, "ten-a-day");
  const funded = hasAmenity(amenities, "funded");
  if (!ten && !funded) return null;
  const province = (d.province || "").toUpperCase();
  if (province === "QC") return "badgeReducedQc";
  if (province === "AB") return "badgeFifteen";
  if (ten) return "badgeTen";
  return null;
}
