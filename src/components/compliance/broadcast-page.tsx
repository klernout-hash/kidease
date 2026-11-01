import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { broadcastCopy } from "@/lib/compliance/broadcast";
import type { PackMode } from "@/lib/compliance/mode";
import { sendAdminBroadcast, sendGovBroadcast } from "@/lib/server/compliance-broadcast";
type Data = { enabled: boolean; mode: PackMode; province: string; rows: { id: string; body: string }[] };
export function GovBroadcastPage({ data, locale, admin }: { data: Data; locale: "en" | "fr"; admin?: boolean }) {
  const copy = broadcastCopy(locale);
  const [body, setBody] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { kind: city ? "city" : "province", province: data.province === "ALL" ? "ON" : data.province, city, body };
      const result = admin ? await sendAdminBroadcast({ data: payload }) : await sendGovBroadcast({ data: payload });
      setNote(result.ok ? (locale === "fr" ? "Avis préparé." : "Notice prepared.") : copy.off);
    } catch { setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help."); }
    finally { setBusy(false); }
  }
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Avis d’urgence" : "Emergency notice"} copy={copy} mode={data.mode} gov={!admin}>
      <p>{data.province}</p>
      {data.mode === "off" ? <Button asChild className="mt-4"><a href={admin ? "/admin" : "/gov"}>{copy.home}</a></Button> : (
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">{locale === "fr" ? "Ville (facultatif)" : "City (optional)"}
            <input className="ke-input mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">{locale === "fr" ? "Avis" : "Notice"}
            <textarea className="ke-input mt-1 min-h-28" value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          {note ? <p role="status">{note}</p> : null}
          <Button type="submit" disabled={busy}>{copy.next}</Button>
        </form>
      )}
      <ul className="mt-4 space-y-2">{data.rows.map((row) => <li key={row.id} className="text-sm">{row.body}</li>)}</ul>
    </ComplianceFrame>
  );
}
