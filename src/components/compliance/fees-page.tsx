import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { feeCopy, publishedCapsFor } from "@/lib/compliance/fees";
import type { PackMode } from "@/lib/compliance/mode";
import { checkDailyFee } from "@/lib/server/compliance-fees";
type CentreData = { enabled: boolean; mode: PackMode; centres: { id: string; name: string; province: string }[]; rows: { age_key: string; daily_cents: number; cap_cents: number | null }[] };
type GovData = { enabled: boolean; mode: PackMode; province: string; rows: { name: string; age_key: string; daily_cents: number; cap_cents: number | null }[] };
export function CentreFeesPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = feeCopy(locale);
  const [daycareId, setDaycareId] = useState(data.centres[0]?.id || "");
  const [ageKey, setAgeKey] = useState("infant");
  const [daily, setDaily] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await checkDailyFee({ data: { daycareId, ageKey, dailyDollars: Number(daily) } });
      if (!result.ok) setNote(copy.off);
      else if (result.decision.status === "warn") setNote(locale === "fr" ? "Ce tarif est au-dessus du plafond. Vous pouvez quand même le changer avant de publier." : "This fee is above the cap. You can still change it before you publish.");
      else if (result.decision.status === "no_cap") setNote(locale === "fr" ? "Cette province n’a pas un seul plafond." : "This province does not have one cap.");
      else if (result.decision.status === "unknown") setNote(locale === "fr" ? "Le plafond n’est pas confirmé. Rien n’est bloqué." : "The cap is not confirmed. Nothing is blocked.");
      else setNote(locale === "fr" ? "Le tarif est sous le plafond." : "The fee is under the cap.");
    } catch { setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help."); }
    finally { setBusy(false); }
  }
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Plafonds de tarifs" : "Fee caps"} copy={copy} mode={data.mode}>
      {data.mode === "off" ? <Button asChild><a href="/">{copy.home}</a></Button> : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">{locale === "fr" ? "Garderie" : "Daycare"}
            <select className="ke-input mt-1" value={daycareId} onChange={(e) => setDaycareId(e.target.value)}>{data.centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Âge" : "Age"}
            <input className="ke-input mt-1" value={ageKey} onChange={(e) => setAgeKey(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Tarif quotidien en dollars" : "Daily fee in dollars"}
            <input className="ke-input mt-1" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} required />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy || data.centres.length === 0}>{copy.next}</Button>
        </form>
      )}
      <ul className="mt-4 space-y-2">{data.rows.map((row, i) => <li key={i} className="text-sm">{row.age_key}: {(row.daily_cents / 100).toFixed(2)}</li>)}</ul>
    </ComplianceFrame>
  );
}
export function GovFeesPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = feeCopy(locale);
  const caps = publishedCapsFor(data.province);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Tarifs au-dessus du plafond" : "Fees above the cap"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p>{data.province}</p>
      {caps.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {caps.map((cap) => (
            <li key={cap.ageKey}>
              {copy.capLine}: {cap.ageKey} — ${((cap.maxDailyCents ?? 0) / 100).toFixed(2)} / {locale === "fr" ? "jour" : "day"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">{copy.empty}</p>
      )}
      {data.rows.length === 0 && caps.length ? <p className="mt-3 text-sm">{copy.clear}</p> : null}
      <ul className="mt-3 space-y-2">{data.rows.map((row, i) => <li key={i}>{row.name} — {row.age_key}</li>)}</ul>
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
