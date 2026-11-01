import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { ratioCopy } from "@/lib/compliance/ratios";
import type { PackMode } from "@/lib/compliance/mode";
import { saveRatioCheck } from "@/lib/server/compliance-ratios";

type CentreData = {
  enabled: boolean;
  mode: PackMode;
  centres: { id: string; name: string; province: string }[];
  rows: { id: string; age_key: string; children: number; staff_count: number; ok: number }[];
};
type GovData = { enabled: boolean; mode: PackMode; province: string; rows: { ageKey: string; breaches: number }[] };

export function CentreRatiosPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = ratioCopy(locale);
  const [daycareId, setDaycareId] = useState(data.centres[0]?.id || "");
  const [ageKey, setAgeKey] = useState("infant");
  const [children, setChildren] = useState("0");
  const [staff, setStaff] = useState("0");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveRatioCheck({ data: { daycareId, ageKey, children: Number(children), staff: Number(staff) } });
      setNote(result.ok ? (result.result.ok ? (locale === "fr" ? "Le ratio est bon." : "The ratio is fine.") : (locale === "fr" ? "Il manque des adultes." : "More adults are needed.")) : copy.off);
    } catch {
      setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help.");
    } finally { setBusy(false); }
  }
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Ratios" : "Room ratios"} copy={copy} mode={data.mode}>
      {data.mode === "off" ? <Button asChild><a href="/">{copy.home}</a></Button> : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">{locale === "fr" ? "Garderie" : "Daycare"}
            <select className="ke-input mt-1" value={daycareId} onChange={(e) => setDaycareId(e.target.value)}>
              {data.centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Groupe" : "Age group"}
            <input className="ke-input mt-1" value={ageKey} onChange={(e) => setAgeKey(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Enfants" : "Children"}
            <input className="ke-input mt-1" inputMode="numeric" value={children} onChange={(e) => setChildren(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Adultes" : "Adults"}
            <input className="ke-input mt-1" inputMode="numeric" value={staff} onChange={(e) => setStaff(e.target.value)} />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy || data.centres.length === 0}>{copy.next}</Button>
        </form>
      )}
      <ul className="mt-4 space-y-2">
        {data.rows.map((row) => <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">{row.age_key}: {row.children} / {row.staff_count}</li>)}
      </ul>
    </ComplianceFrame>
  );
}

export function GovRatiosPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = ratioCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Rapport mensuel" : "Monthly ratio report"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p>{data.province}</p>
      {data.rows.length === 0 ? <p className="mt-3 text-sm">{copy.empty}</p> : null}
      <ul className="mt-3 space-y-2">{data.rows.map((row) => <li key={row.ageKey}>{row.ageKey}: {row.breaches}</li>)}</ul>
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
