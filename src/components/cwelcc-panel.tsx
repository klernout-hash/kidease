import { useMemo, useState } from "react";
import {
  CWELCC_DISCLAIMER,
  CWELCC_PROVINCES,
  applySubsidies,
  attendanceSignOffReady,
  cwelccDailyFee,
  isCwelccProvince,
  occmsPrintable,
  recordOfAttendance,
  splitFamilyBill,
  type AttendanceMark,
  type CwelccProvince,
} from "@/lib/cwelcc";
import { useCopy } from "@/lib/use-copy";

function dollarsToCents(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export function CwelccPanel() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [province, setProvince] = useState<CwelccProvince>("ON");
  const [participating, setParticipating] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [tenDollar, setTenDollar] = useState(false);
  const [full, setFull] = useState("");
  const [prior, setPrior] = useState("");
  const [reduction, setReduction] = useState("");
  const [provincial, setProvincial] = useState("");
  const [municipal, setMunicipal] = useState("");
  const [shareA, setShareA] = useState("60");
  const [shareB, setShareB] = useState("40");
  const [firstSign, setFirstSign] = useState("");
  const [secondSign, setSecondSign] = useState("");
  const marks: AttendanceMark[] = ["present", "absent", "closed"];

  const fee = useMemo(
    () =>
      cwelccDailyFee({
        province,
        participating,
        eligible,
        fullDailyCents: dollarsToCents(full),
        feeOn2024_12_31Cents: prior.trim() ? dollarsToCents(prior) : null,
        tenDollarSite: tenDollar,
        enteredReductionCents: dollarsToCents(reduction),
      }),
    [province, participating, eligible, full, prior, tenDollar, reduction],
  );
  const subsidies = applySubsidies(fee.parentCents, dollarsToCents(provincial), dollarsToCents(municipal));
  const split = splitFamilyBill(subsidies.parentOwingCents, [
    { key: "a", bps: Math.round(Number(shareA) * 100) },
    { key: "b", bps: Math.round(Number(shareB) * 100) },
  ]);
  const attendance = recordOfAttendance(marks, null);
  const signed = attendanceSignOffReady(firstSign, secondSign);
  const sheet = occmsPrintable([
    {
      child: fr ? "Enfant" : "Child",
      ageGroup: "preschool",
      present: attendance.present,
      absent: attendance.absent,
      fullCents: dollarsToCents(full),
      reductionCents: fee.reductionCents,
      parentCents: fee.parentCents,
      provincialCents: subsidies.provincialCents,
      municipalCents: subsidies.municipalCents,
    },
  ]);

  return (
    <section className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="cwelcc-panel">
      <h2 className="font-display text-xl">{fr ? "Réduction de frais" : "Fee reduction"}</h2>
      <p className="mt-2 text-sm">
        {fr
          ? "KidEase n'est pas affilié à un gouvernement. Confirmez ces chiffres avec votre gestionnaire de services. KidEase ne transmet pas ceci au gouvernement."
          : CWELCC_DISCLAIMER}
      </p>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Ontario d'abord. La Colombie-Britannique et l'Alberta sont dans les mêmes règles. Ceci est un aperçu, pas une demande."
          : "Ontario first. British Columbia and Alberta use the same screen. This is a preview, not a claim."}
      </p>
      <label className="mt-4 block text-sm">
        {fr ? "Province" : "Province"}
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
          value={province}
          onChange={(event) => {
            if (isCwelccProvince(event.target.value)) setProvince(event.target.value);
          }}
        >
          {CWELCC_PROVINCES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={participating} onChange={(event) => setParticipating(event.target.checked)} />
        {fr ? "Ce centre participe" : "This centre participates"}
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={eligible} onChange={(event) => setEligible(event.target.checked)} />
        {fr ? "Cet enfant est admissible" : "This child is eligible"}
      </label>
      {province === "BC" ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={tenDollar} onChange={(event) => setTenDollar(event.target.checked)} />
          {fr ? "Site à 10 $ par jour" : "$10-a-day site"}
        </label>
      ) : null}
      <label className="mt-3 block text-sm">
        {fr ? "Frais complets par jour ($)" : "Full fee per day ($)"}
        <input inputMode="decimal" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={full} onChange={(event) => setFull(event.target.value)} />
      </label>
      {province === "ON" ? (
        <label className="mt-3 block text-sm">
          {fr ? "Frais du 31 décembre 2024 ($), s'il est plus bas" : "December 31, 2024 fee ($), if it was lower"}
          <input inputMode="decimal" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={prior} onChange={(event) => setPrior(event.target.value)} />
        </label>
      ) : (
        <label className="mt-3 block text-sm">
          {fr ? "Réduction que vous entrez ($)" : "Reduction you enter ($)"}
          <input inputMode="decimal" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={reduction} onChange={(event) => setReduction(event.target.value)} />
        </label>
      )}
      <label className="mt-3 block text-sm">
        {fr ? "Subvention provinciale ($)" : "Provincial subsidy ($)"}
        <input inputMode="decimal" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={provincial} onChange={(event) => setProvincial(event.target.value)} />
      </label>
      <label className="mt-3 block text-sm">
        {fr ? "Subvention municipale ($)" : "Municipal subsidy ($)"}
        <input inputMode="decimal" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={municipal} onChange={(event) => setMunicipal(event.target.value)} />
      </label>
      <p className="mt-4 text-sm" data-ke="cwelcc-result">
        {fr ? "Frais parent" : "Parent fee"}: ${(fee.parentCents / 100).toFixed(2)}. {fr ? "Réduction" : "Reduction"}: $
        {(fee.reductionCents / 100).toFixed(2)}. {fr ? "À payer" : "Owing"}: ${(subsidies.parentOwingCents / 100).toFixed(2)}.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          {fr ? "Part du premier foyer (%)" : "First household share (%)"}
          <input inputMode="numeric" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={shareA} onChange={(event) => setShareA(event.target.value)} />
        </label>
        <label className="block text-sm">
          {fr ? "Part du second foyer (%)" : "Second household share (%)"}
          <input inputMode="numeric" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={shareB} onChange={(event) => setShareB(event.target.value)} />
        </label>
      </div>
      <p className="mt-2 text-sm">
        {split.ok
          ? split.parts.map((part) => `${part.key === "a" ? (fr ? "Premier" : "First") : fr ? "Second" : "Second"} $${(part.cents / 100).toFixed(2)}`).join(". ")
          : fr
            ? "Les deux parts doivent faire 100 %."
            : "The two shares must add up to 100%."}
      </p>
      <p className="mt-4 text-sm">
        {fr ? "Présences" : "Present"} {attendance.present}. {fr ? "Absences" : "Absent"} {attendance.absent}. {fr ? "Fermetures" : "Closed"} {attendance.closed}.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          {fr ? "Première signature" : "First sign-off"}
          <input className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={firstSign} onChange={(event) => setFirstSign(event.target.value)} />
        </label>
        <label className="block text-sm">
          {fr ? "Deuxième signature" : "Second sign-off"}
          <input className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={secondSign} onChange={(event) => setSecondSign(event.target.value)} />
        </label>
      </div>
      <p className="mt-2 text-sm">{signed ? (fr ? "Deux personnes ont signé." : "Two people have signed.") : fr ? "Il faut une deuxième personne." : "A second person still needs to sign."}</p>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-sm" data-ke="cwelcc-sheet">
        {sheet}
      </pre>
    </section>
  );
}
