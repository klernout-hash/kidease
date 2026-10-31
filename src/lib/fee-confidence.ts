/**
 * Monthly fee honesty.
 * A catalogue or provincial backfill is an estimate.
 * A centre-entered amount is confirmed.
 * The placeholder 218 is not a fee unless the centre saved it.
 */

export const FEE_CONFIDENCE_CENTRE = "centre" as const;
export const FEE_CONFIDENCE_ESTIMATE = "estimate" as const;
export const CATALOGUE_MONTHLY_FEE_GUESS = 218;

export type FeeConfidence = typeof FEE_CONFIDENCE_CENTRE | typeof FEE_CONFIDENCE_ESTIMATE;

export type FeeAmountInput = {
  infantMonthly?: number | null;
  toddlerMonthly?: number | null;
  preschoolMonthly?: number | null;
  partTimeMonthly?: number | null;
  live?: boolean | null;
  feeConfidence?: string | null;
};

const MAX_MONTHLY = 8000;

export function parseOptionalMonthlyFee(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > MAX_MONTHLY) return null;
  return Math.round(n);
}

function positiveFees(d: FeeAmountInput): number[] {
  return [d.infantMonthly, d.toddlerMonthly, d.preschoolMonthly, d.partTimeMonthly].filter(
    (n): n is number => typeof n === "number" && n > 0,
  );
}

export function resolveFeeConfidence(d: FeeAmountInput): FeeConfidence | null {
  const amounts = positiveFees(d);
  if (!amounts.length) return null;
  const raw = String(d.feeConfidence || "").trim().toLowerCase();
  if (raw === FEE_CONFIDENCE_CENTRE) return FEE_CONFIDENCE_CENTRE;
  if (raw === FEE_CONFIDENCE_ESTIMATE) return FEE_CONFIDENCE_ESTIMATE;
  if (amounts.every((n) => n === CATALOGUE_MONTHLY_FEE_GUESS)) return null;
  return d.live ? FEE_CONFIDENCE_CENTRE : FEE_CONFIDENCE_ESTIMATE;
}
