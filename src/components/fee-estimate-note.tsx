import { feeEstimate, feeEstimatorEnabled } from "@/lib/invoice-money";
import { useCopy } from "@/lib/use-copy";

/** Extra line on the calculator. Hidden unless FEATURE_FEE_ESTIMATOR is on. */
export function FeeEstimateNote({
  province,
  householdIncome,
  ageBand,
  grossMonthly,
  participating,
}: {
  province: string;
  householdIncome: number;
  ageBand: "infant" | "toddler" | "preschool" | "school-age";
  grossMonthly: number;
  participating?: boolean;
}) {
  const { locale } = useCopy();
  if (!feeEstimatorEnabled()) return null;
  const estimate = feeEstimate({ province, householdIncome, ageBand, grossMonthly, participating });
  if (!estimate) return null;
  const fr = locale === "fr";
  return (
    <aside className="mt-4 rounded-xl bg-surface p-4 text-sm ring-1 ring-border" data-ke="fee-estimate">
      <h2 className="font-medium">{fr ? "Estimation subvention et crédit" : "Subsidy and credit estimate"}</h2>
      <p className="mt-2">{fr ? estimate.programFr : estimate.programEn}</p>
      <p className="mt-2 text-muted">{fr ? estimate.disclaimerFr : estimate.disclaimerEn}</p>
    </aside>
  );
}
