import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { COMPLAINT_KINDS, complaintCopy } from "@/lib/compliance/complaints";
import type { PackMode } from "@/lib/compliance/mode";
import { saveComplaint } from "@/lib/server/compliance-complaints";
type ParentData = { enabled: boolean; mode: PackMode; rows: { id: string; tracking_code: string; province: string; status: string }[] };
type GovData = { enabled: boolean; mode: PackMode; province: string; rows: { id: string; kind: string; status: string; trackingCode: string }[] };
export function ParentComplaintsPage({ data, locale }: { data: ParentData; locale: "en" | "fr" }) {
  const copy = complaintCopy(locale);
  const [province, setProvince] = useState("ON");
  const [kind, setKind] = useState<(typeof COMPLAINT_KINDS)[number]>("supervision");
  const [detail, setDetail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveComplaint({ data: { province, kind, detail } });
      setNote(result.ok ? (locale === "fr" ? `Numéro : ${result.trackingCode}` : `Your number is ${result.trackingCode}`) : copy.off);
    } catch { setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help."); }
    finally { setBusy(false); }
  }
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Plainte" : "Licensing complaint"} copy={copy} mode={data.mode}>
      {data.mode === "off" ? <Button asChild><a href="/">{copy.home}</a></Button> : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">{locale === "fr" ? "Province" : "Province"}
            <input className="ke-input mt-1" value={province} onChange={(e) => setProvince(e.target.value)} maxLength={2} required />
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Sujet" : "Topic"}
            <select className="ke-input mt-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {COMPLAINT_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Ce qui s’est passé" : "What happened"}
            <textarea className="ke-input mt-1 min-h-28" value={detail} onChange={(e) => setDetail(e.target.value)} required />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy}>{copy.next}</Button>
        </form>
      )}
      <ul className="mt-4 space-y-2">{data.rows.map((row) => <li key={row.id}>{row.tracking_code} — {row.status}</li>)}</ul>
    </ComplianceFrame>
  );
}
export function GovComplaintsPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = complaintCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Plaintes" : "Complaints"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p>{data.province}</p>
      {data.rows.length === 0 ? <p className="mt-3 text-sm">{copy.empty}</p> : null}
      <ul className="mt-3 space-y-2">{data.rows.map((row) => <li key={row.id}>{row.trackingCode} — {row.kind} — {row.status}</li>)}</ul>
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
