import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { knownListingMonthlyFee, type ListingFeeInput } from "@/lib/listing-fee";
import {
  PROVINCES,
  estimateNetCost,
  isProvinceCode,
  type CostAgeBand,
  type ProvinceCode,
} from "@/lib/net-cost-engine";
import { FeeEstimateNote } from "@/components/fee-estimate-note";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

const AGES: CostAgeBand[] = ["infant", "toddler", "preschool", "school-age"];

const AGE_LABEL: Record<CostAgeBand, { en: string; fr: string }> = {
  infant: { en: "Infant", fr: "Poupon" },
  toddler: { en: "Toddler", fr: "Tout-petit" },
  preschool: { en: "Preschool", fr: "Préscolaire" },
  "school-age": { en: "School-age", fr: "Âge scolaire" },
};

function cad(n: number, fr: boolean): string {
  return n.toLocaleString(fr ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" });
}

export function NetCostCalculator({
  province,
  grossMonthly,
  fees,
  programDaily,
  participating,
  showPageLink = true,
}: {
  province?: string;
  grossMonthly?: number | null;
  fees?: ListingFeeInput;
  programDaily?: number | null;
  participating?: boolean;
  showPageLink?: boolean;
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const startProvince: ProvinceCode = province && isProvinceCode(province) ? province.trim().toUpperCase() as ProvinceCode : "MB";
  const [prov, setProv] = useState<ProvinceCode>(startProvince);
  const [income, setIncome] = useState(70_000);
  const [age, setAge] = useState<CostAgeBand>("preschool");
  const [feeEdited, setFeeEdited] = useState(false);
  const storedFee = knownListingMonthlyFee(
    { ...fees, programDaily: programDaily ?? fees?.programDaily },
    age,
  );
  const startingFee = storedFee ?? (grossMonthly && grossMonthly > 0 ? Math.round(grossMonthly) : null);
  const [grossText, setGrossText] = useState(startingFee ? String(startingFee) : "");
  const [inProgram, setInProgram] = useState(participating === true);
  const [qcReduced, setQcReduced] = useState(false);

  useEffect(() => {
    if (feeEdited) return;
    const next = knownListingMonthlyFee({ ...fees, programDaily: programDaily ?? fees?.programDaily }, age);
    if (next) setGrossText(String(next));
  }, [age, feeEdited, fees, programDaily]);
  const gross = Number(grossText);

  const result = useMemo(() => {
    if (!Number.isFinite(gross) || gross <= 0) return null;
    return estimateNetCost({
      province: prov,
      householdIncome: income,
      ageBand: age,
      grossMonthly: gross,
      participating: inProgram,
      qcSubsidized: prov === "QC" && qcReduced,
    });
  }, [age, gross, inProgram, income, prov, qcReduced]);

  return (
    <section className="rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="net-cost-calculator">
      <h2 className="font-display text-2xl">{fr ? "Coût net estimé" : "Estimated net cost"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Entrez le tarif mensuel affiché par le centre. KidEase estime le coût après les programmes publics. Ce n'est pas une décision du ministère."
          : "Enter the centre's posted monthly fee. KidEase estimates the cost after public programs. This is not a ministry decision."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Province ou territoire" : "Province or territory"}</span>
          <select className="ke-input mt-1 w-full" value={prov} onChange={(event) => setProv(event.target.value as ProvinceCode)}>
            {PROVINCES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Âge" : "Age band"}</span>
          <select className="ke-input mt-1 w-full" value={age} onChange={(event) => setAge(event.target.value as CostAgeBand)}>
            {AGES.map((band) => (
              <option key={band} value={band}>{fr ? AGE_LABEL[band].fr : AGE_LABEL[band].en}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">{fr ? "Revenu familial annuel" : "Household income a year"}</span>
          <input
            type="range"
            min={0}
            max={200000}
            step={1000}
            value={income}
            className="mt-2 w-full accent-primary"
            aria-valuemin={0}
            aria-valuemax={200000}
            aria-valuenow={income}
            onChange={(event) => setIncome(Number(event.target.value))}
          />
          <span className="mt-1 block tabular-nums">{cad(income, fr)}</span>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium">{fr ? "Tarif mensuel affiché" : "Posted monthly fee"}</span>
          <input
            inputMode="decimal"
            className="ke-input mt-1 w-full"
            value={grossText}
            onChange={(event) => {
              setFeeEdited(true);
              setGrossText(event.target.value.replace(/[^\d.]/g, "").slice(0, 7));
            }}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          />
        </label>
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={inProgram} onChange={(event) => setInProgram(event.target.checked)} />
        {fr ? "Ce centre participe au tarif réduit provincial" : "This centre is in the provincial reduced-fee program"}
      </label>
      {prov === "QC" ? (
        <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={qcReduced} onChange={(event) => setQcReduced(event.target.checked)} />
          {fr ? "Place à contribution réduite (environ 9,65 $ par jour)" : "Reduced-contribution space (about $9.65 a day)"}
        </label>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-fg">
          <p className="text-sm text-muted">{fr ? result.programFr : result.programEn}</p>
          <p className="mt-2 font-display text-3xl tabular-nums">{cad(result.netMonthlyAfterT778, fr)}</p>
          <p className="text-sm text-muted">{fr ? "par mois après l'estimation T778" : "a month after the T778 estimate"}</p>
          <ul className="mt-3 space-y-1 text-sm tabular-nums">
            <li>{fr ? "Par jour" : "A day"}: {cad(result.parentDaily, fr)}</li>
            <li>{fr ? "Par année, avant T778" : "A year, before T778"}: {cad(result.parentAnnual, fr)}</li>
            <li>{fr ? "Économie T778 estimée" : "Estimated T778 savings"}: {cad(result.t778AnnualSavings, fr)}</li>
            <li>{fr ? "ACE fédérale estimée (à part)" : "Estimated federal CCB (separate)"}: {cad(result.ccbMonthly, fr)}{fr ? " / mois" : " / month"}</li>
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">{fr ? "Ajoutez le tarif affiché pour voir l'estimation." : "Add the posted fee to see the estimate."}</p>
      )}
      {result ? (
        <FeeEstimateNote
          province={prov}
          householdIncome={income}
          ageBand={age}
          grossMonthly={gross}
          participating={inProgram}
        />
      ) : null}
      {showPageLink ? (
        <p className="mt-3 text-sm">
          <Link to={localePath("/calculator", locale)} className="font-medium text-primary underline-offset-4 hover:underline">
            {fr ? "Ouvrir le calculateur" : "Open the calculator"}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
