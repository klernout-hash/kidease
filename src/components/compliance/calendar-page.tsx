import { useState, type FormEvent } from "react";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { CALENDAR_KINDS, calendarCopy } from "@/lib/compliance/calendar";
import type { PackMode } from "@/lib/compliance/mode";
import { saveCalendarItem } from "@/lib/server/compliance-calendar";

type CentreData = {
  enabled: boolean;
  mode: PackMode;
  centres: { id: string; name: string; province: string }[];
  rows: { id: string; kind: string; due_on: string; completed_at: string | null }[];
};

type GovData = {
  enabled: boolean;
  mode: PackMode;
  province: string;
  overdue: number;
  rows: { daycareId: string; kind: string; dueOn: string }[];
};

export function CentreCalendarPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = calendarCopy(locale);
  const [daycareId, setDaycareId] = useState(data.centres[0]?.id || "");
  const [kind, setKind] = useState<(typeof CALENDAR_KINDS)[number]>("licence_renewal");
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveCalendarItem({ data: { daycareId, kind, dueOn } });
      setNote(result.ok ? (locale === "fr" ? "Date enregistrée." : "Date saved.") : copy.off);
    } catch {
      setNote(locale === "fr" ? "Essayez encore, ou ouvrez l’aide." : "Try again, or open Help.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Dates de conformité" : "Compliance dates"} copy={copy} mode={data.mode}>
      {data.mode === "off" ? (
        <Button asChild>
          <a href="/">{copy.home}</a>
        </Button>
      ) : (
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Garderie" : "Daycare"}
            <select className="ke-input mt-1" value={daycareId} onChange={(event) => setDaycareId(event.target.value)}>
              {data.centres.map((centre) => (
                <option key={centre.id} value={centre.id}>{centre.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Type" : "Type"}
            <select className="ke-input mt-1" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              {CALENDAR_KINDS.map((item) => (
                <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {locale === "fr" ? "Date" : "Date"}
            <input className="ke-input mt-1" type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} required />
          </label>
          {note ? <p role="alert">{note}</p> : null}
          <Button type="submit" disabled={busy || data.centres.length === 0}>{copy.next}</Button>
        </form>
      )}
      {data.rows.length === 0 ? <p className="mt-4 text-sm text-muted">{copy.empty}</p> : null}
      <ul className="mt-4 space-y-2">
        {data.rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
            {row.kind.replaceAll("_", " ")} — {String(row.due_on).slice(0, 10)}
          </li>
        ))}
      </ul>
    </ComplianceFrame>
  );
}

export function GovCalendarPage({ data, locale }: { data: GovData; locale: "en" | "fr" }) {
  const copy = calendarCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Dates en retard" : "Overdue dates"} copy={{ ...copy, what: copy.govWhat, why: copy.govWhy }} mode={data.mode} gov>
      <p className="text-sm">{data.province}: {data.overdue}</p>
      {data.rows.length === 0 ? <p className="mt-3 text-sm">{copy.empty}</p> : null}
      <ul className="mt-3 space-y-2">
        {data.rows.map((row) => (
          <li key={`${row.daycareId}-${row.kind}-${row.dueOn}`} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
            {row.kind.replaceAll("_", " ")} — {row.dueOn}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-4">
        <a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a>
      </Button>
    </ComplianceFrame>
  );
}
