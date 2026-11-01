import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { INCIDENT_KINDS, incidentCopy } from "@/lib/compliance/incidents";
import type { PackMode } from "@/lib/compliance/mode";
import { saveIncident } from "@/lib/server/compliance-incidents";

type CentreData = {
  enabled: boolean;
  mode: PackMode;
  centres: { id: string; name: string; province: string }[];
  rows: { id: string; daycare_id: string; kind: string; summary: string; filed_at: string | null; aware_at: string }[];
};

type GovData = {
  enabled: boolean;
  mode: PackMode;
  province: string;
  filings: { id: string; kind: string; summary: string; child_label: string | null; filed_at: string | null; aware_at: string }[];
  counts: { kind: string; count: number }[];
};

type ParentData = {
  enabled: boolean;
  mode: PackMode;
  rows: { id: string; kind: string; summary: string; aware_at: string }[];
};

export function CentreIncidentsPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = incidentCopy(locale);
  const [daycareId, setDaycareId] = useState(data.centres[0]?.id || "");
  const [kind, setKind] = useState<(typeof INCIDENT_KINDS)[number]>("injury");
  const [summary, setSummary] = useState("");
  const [childLabel, setChildLabel] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const result = await saveIncident({ data: { daycareId, kind, summary, childLabel } });
      setNote(result.ok ? (locale === "fr" ? "Rapport enregistré." : "Report saved.") : copy.off);
      if (result.ok) setSummary("");
    } catch {
      setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Événement grave" : "Serious occurrence"} copy={copy} mode={data.mode}>
      <p className="text-sm">{copy.abuse}</p>
      {data.mode === "off" ? (
        <Button asChild className="mt-4">
          <a href="/">{copy.home}</a>
        </Button>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Garderie" : "Daycare"}
            <select className="ke-input mt-1" value={daycareId} onChange={(event) => setDaycareId(event.target.value)} required>
              {data.centres.map((centre) => (
                <option key={centre.id} value={centre.id}>
                  {centre.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Type" : "Type"}
            <select className="ke-input mt-1" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              {INCIDENT_KINDS.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Ce qui s’est passé" : "What happened"}
            <textarea className="ke-input mt-1 min-h-28" value={summary} onChange={(event) => setSummary(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Enfant (le bureau de la province seulement)" : "Child (province office only)"}
            <input className="ke-input mt-1" value={childLabel} onChange={(event) => setChildLabel(event.target.value)} autoComplete="off" />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy || data.centres.length === 0}>
            {copy.next}
          </Button>
        </form>
      )}
      {data.rows.length === 0 ? <p className="mt-6 text-sm text-muted">{copy.empty}</p> : null}
      <ul className="mt-4 space-y-2">
        {data.rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
            {row.kind.replaceAll("_", " ")} — {row.summary}
          </li>
        ))}
      </ul>
    </ComplianceFrame>
  );
}

export function GovIncidentsPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = incidentCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Rapports reçus" : "Reports filed"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p className="text-sm text-muted">{data.province}</p>
      <ul className="mt-4 space-y-2">
        {data.counts.map((row) => (
          <li key={row.kind}>
            {row.kind.replaceAll("_", " ")}: {row.count}
          </li>
        ))}
      </ul>
      {data.filings.length === 0 ? <p className="mt-4 text-sm">{copy.empty}</p> : null}
      <ul className="mt-4 space-y-2">
        {data.filings.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
            <p>{row.kind.replaceAll("_", " ")}</p>
            <p>{row.summary}</p>
            {row.child_label ? <p>{row.child_label}</p> : null}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-4">
        <a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a>
      </Button>
    </ComplianceFrame>
  );
}

export function ParentIncidentsPage({ data, locale }: { data: ParentData; locale: "en" | "fr" }) {
  const copy = incidentCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Notes de la garderie" : "Notes from your daycare"} copy={copy} mode={data.mode}>
      {data.rows.length === 0 ? <p>{copy.empty}</p> : null}
      <ul className="space-y-2">
        {data.rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
            {row.summary}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-4">
        <a href={locale === "fr" ? "/fr" : "/"}>{copy.home}</a>
      </Button>
    </ComplianceFrame>
  );
}
