import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { fundingCopy } from "@/lib/compliance/funding";
import type { PackMode } from "@/lib/compliance/mode";
import { buildFundingReport } from "@/lib/server/compliance-funding";

type CentreData = { enabled: boolean; mode: PackMode; centres: { id: string; name: string }[]; report: null };
type GovData = { enabled: boolean; mode: PackMode; province: string; rows: { blocked: boolean; count: number }[] };

export function CentreFundingPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = fundingCopy(locale);
  const [daycareId, setDaycareId] = useState(data.centres[0]?.id || "");
  const [period, setPeriod] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await buildFundingReport({ data: { daycareId, period } });
      if (!result.ok) setNote(copy.off);
      else if (result.plan === "blocked") setNote(locale === "fr" ? "Il y a un écart. Rien n’est soumis." : "There is a mismatch. Nothing is submitted.");
      else setNote(locale === "fr" ? "Rapport vérifié." : "Report checked.");
    } catch {
      setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help.");
    } finally { setBusy(false); }
  }
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Rapport de financement" : "Funding report"} copy={copy} mode={data.mode}>
      {data.mode === "off" ? <Button asChild><a href="/">{copy.home}</a></Button> : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">{locale === "fr" ? "Garderie" : "Daycare"}
            <select className="ke-input mt-1" value={daycareId} onChange={(e) => setDaycareId(e.target.value)}>
              {data.centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Mois" : "Month"}
            <input className="ke-input mt-1" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy || data.centres.length === 0}>{copy.next}</Button>
        </form>
      )}
    </ComplianceFrame>
  );
}

export function GovFundingPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = fundingCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Rapports mensuels" : "Monthly reports"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p>{data.province}</p>
      <ul className="mt-3 space-y-2">{data.rows.map((row) => <li key={String(row.blocked)}>{row.blocked ? (locale === "fr" ? "Avec écart" : "With a mismatch") : (locale === "fr" ? "Sans écart" : "No mismatch")}: {row.count}</li>)}</ul>
      {data.rows.length === 0 ? <p className="mt-3 text-sm">{copy.empty}</p> : null}
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
