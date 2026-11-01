import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { CREDENTIAL_KINDS, screeningCopy } from "@/lib/compliance/screening";
import type { PackMode } from "@/lib/compliance/mode";
import { saveCredential } from "@/lib/server/compliance-screening";

type CentreData = {
  enabled: boolean;
  mode: PackMode;
  centres: { id: string; name: string }[];
  rows: { id: string; staff_name: string; kind: string; expires_on: string | null; status: string }[];
};

type GovData = { enabled: boolean; mode: PackMode; province: string; expired: number; expiring: number };

export function CentreScreeningPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = screeningCopy(locale);
  const [daycareId, setDaycareId] = useState(data.centres[0]?.id || "");
  const [staffName, setStaffName] = useState("");
  const [kind, setKind] = useState<(typeof CREDENTIAL_KINDS)[number]>("vulnerable_sector");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveCredential({ data: { daycareId, staffName, kind, expiresOn } });
      setNote(result.ok ? (locale === "fr" ? "Date enregistrée." : "Date saved.") : copy.off);
    } catch {
      setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Vérifications du personnel" : "Staff screening"} copy={copy} mode={data.mode}>
      {data.mode === "off" ? (
        <Button asChild><a href="/">{copy.home}</a></Button>
      ) : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Garderie" : "Daycare"}
            <select className="ke-input mt-1" value={daycareId} onChange={(event) => setDaycareId(event.target.value)}>
              {data.centres.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Nom du personnel" : "Staff name"}
            <input className="ke-input mt-1" value={staffName} onChange={(event) => setStaffName(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Document" : "Document"}
            <select className="ke-input mt-1" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              {CREDENTIAL_KINDS.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Échéance" : "Expiry date"}
            <input className="ke-input mt-1" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} required />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy || data.centres.length === 0}>{copy.next}</Button>
        </form>
      )}
      <ul className="mt-4 space-y-2">
        {data.rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
            {row.staff_name} — {row.kind.replaceAll("_", " ")} — {row.status}
          </li>
        ))}
      </ul>
      {data.rows.length === 0 ? <p className="mt-4 text-sm text-muted">{copy.empty}</p> : null}
    </ComplianceFrame>
  );
}

export function GovScreeningPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = screeningCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Dossiers expirés" : "Expired records"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p>{data.province}</p>
      <p className="mt-2">{locale === "fr" ? "Expirés" : "Expired"}: {data.expired}</p>
      <p>{locale === "fr" ? "Bientôt dus" : "Due soon"}: {data.expiring}</p>
      <Button asChild className="mt-4">
        <a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a>
      </Button>
    </ComplianceFrame>
  );
}
