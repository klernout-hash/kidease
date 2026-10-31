import { getSql } from "@/lib/db";
import { parseOptionalMonthlyFee } from "@/lib/fee-confidence";

export type CentreFeeInput = {
  infantMonthly?: unknown;
  toddlerMonthly?: unknown;
  preschoolMonthly?: unknown;
};

export async function ensureFeeConfidenceColumn() {
  const sql = await getSql();
  await sql`alter table daycares add column if not exists fee_confidence text`.catch(() => undefined);
}

/** Write only the bands the centre filled in. Blank boxes keep the current amount. */
export async function saveCentreMonthlyFees(daycareId: string, input: CentreFeeInput) {
  const infant = parseOptionalMonthlyFee(input.infantMonthly);
  const toddler = parseOptionalMonthlyFee(input.toddlerMonthly);
  const preschool = parseOptionalMonthlyFee(input.preschoolMonthly);
  if (infant == null && toddler == null && preschool == null) return { saved: false as const };
  await ensureFeeConfidenceColumn();
  const sql = await getSql();
  await sql`
    update daycares set
      infant_monthly = coalesce(${infant}, infant_monthly),
      toddler_monthly = coalesce(${toddler}, toddler_monthly),
      preschool_monthly = coalesce(${preschool}, preschool_monthly),
      fee_confidence = 'centre'
    where id = ${daycareId}
  `;
  return { saved: true as const };
}
