import { useState, type FormEvent } from "react";
import { suppressRows } from "@/lib/gov/k-anonymity";
import { ComplianceFrame } from "@/components/compliance/frame";
import { useSuccessConfirm } from "@/components/use-success-confirm";
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
  counts?: { kind: string; n: number }[];
};

export function CentreCalendarPage({ data, locale }: { data: CentreData; locale: "en" | "fr" }) {
  const copy = calendarCopy(locale);
  const { celebrate } = useSuccessConfirm();
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
      if (result.ok) celebrate();
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

export function GovCalendarPage({ data, locale, showDates = false }: { data: GovData; locale: "en" | "fr"; showDates?: boolean }) {
  const copy = calendarCopy(locale);
  const counts = data.counts ?? [];
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Dates de permis" : "Licence dates"} copy={{ ...copy, what: copy.govWhat, why: locale === "fr" ? "Seules les dates enregistrées dans cet outil. Un permis, un document, une inspection et un constat officiel sont des choses distinctes." : "Only dates saved in this tool. A licence, a document, an inspection, and an official finding are different things." }} mode={data.mode} gov>
      <ul className="mt-3 space-y-2 text-sm leading-6" data-ke="gov-status-lanes">
        <li>{locale === "fr" ? "Permis : seulement les dates qu’un fournisseur a enregistrées ici. Une date inconnue, sans expiration, ou un renouvellement en cours n’est pas marqué expiré." : "Licence: only dates a provider saved here. An unknown date, a licence with no expiry, or a renewal in progress is not marked expired."}</li>
        <li>{locale === "fr" ? "Documents : une assurance ou une formation téléversée n’est pas suivie ici, et ce n’est pas le permis." : "Documents: an uploaded insurance or training file is not tracked here, and it is not the licence."}</li>
        <li>{locale === "fr" ? "Inspections : un rapport public absent n’est pas une inspection manquée." : "Inspections: a missing public report is not a missed inspection."}</li>
        <li>{locale === "fr" ? "Constats officiels : non chargés. Une plainte n’est pas un constat." : "Official findings: not loaded. A complaint is not a finding."}</li>
        <li>{locale === "fr" ? "Fraîcheur de la fiche : un import en retard est un problème de source, pas une infraction." : "Listing freshness: a late import is a feed issue, not a provider violation."}</li>
      </ul>
      {showDates ? (
        <>
          <p className="mt-3 text-sm">{locale === "fr" ? "Dates en retard suivies dans cet outil" : "Tracked overdue dates in this tool"}: {data.overdue}. {locale === "fr" ? "Un zéro ne veut pas dire que chaque permis est à jour." : "A zero does not mean every licence is current."}</p>
          {data.rows.length === 0 ? <p className="mt-3 text-sm" data-ke="gov-no-dates">{locale === "fr" ? "Aucune date suivie. Un zéro ne veut pas dire que chaque permis est à jour." : "No tracked dates. A zero does not mean every licence is current."}</p> : null}
          <ul className="mt-3 space-y-2">
            {data.rows.map((row) => (
              <li key={`${row.daycareId}-${row.kind}-${row.dueOn}`} className="rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">
                {row.kind.replaceAll("_", " ")} — {row.dueOn}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm" data-ke="gov-date-counts">{locale === "fr" ? "Totaux seulement. Le centre et sa date restent hors de ce bureau. Un petit groupe est masqué." : "Counts only. The centre and its date stay off this desk. A small group is hidden."}</p>
          {counts.length === 0 ? <p className="mt-3 text-sm" data-ke="gov-no-dates">{locale === "fr" ? "Aucune date suivie. Un zéro ne veut pas dire que chaque permis est à jour." : "No tracked dates. A zero does not mean every licence is current."}</p> : null}
          <ul className="mt-3 space-y-2">
            {suppressRows(counts).map((row) => (
              <li key={row.kind}>{row.kind.replaceAll("_", " ")}: {row.suppressed ? (locale === "fr" ? "masqué (<5)" : "hidden (<5)") : row.n}</li>
            ))}
          </ul>
        </>
      )}
      <Button asChild className="mt-4">
        <a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a>
      </Button>
    </ComplianceFrame>
  );
}
