import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GovFrame } from "@/components/gov/gov-frame";
import { Button } from "@/components/ui/button";
import { formatGovAsOf } from "@/lib/gov/as-of";
import { govPage, govPageHref } from "@/lib/gov/desk";
import {
  exportGovDeskCsv,
  govChangeDecision,
  govComplaintUpdate,
  govIncidentDetail,
  govIncidentReviewed,
  govNotificationsRead,
  govSaveBroadcast,
  govSendBroadcast,
  type GovDeskPageData,
  type GovDeskRow,
} from "@/lib/server/gov-desk";

type L = "en" | "fr";
const tx = (locale: L, en: string, fr: string) => (locale === "fr" ? fr : en);

const TONE: Record<string, string> = {
  bad: "ring-2 ring-red-600/60",
  warn: "ring-2 ring-amber-500/60",
  ok: "ring-1 ring-border",
};

function errorText(locale: L, code: string): string {
  const map: Record<string, [string, string]> = {
    read_only: ["This account is read only.", "Ce compte est en lecture seule."],
    note: ["Add a short note (4 to 500 characters).", "Ajoutez une courte note (4 à 500 caractères)."],
    state: ["This item changed. Refresh and try again.", "Ce dossier a changé. Actualisez et réessayez."],
    missing: ["We could not find that item in your province.", "Ce dossier est introuvable dans votre province."],
    off: ["This tool is switched off.", "Cet outil est éteint."],
    text: ["Add a title (3+ characters) and a notice (8 to 500 characters).", "Ajoutez un titre (3 caractères ou plus) et un avis (8 à 500 caractères)."],
    centres: ["Pick at least one centre first.", "Choisissez au moins un centre."],
    blocked: ["Some picked centres cannot get this notice here. Only test centres can be picked on the test site.", "Certains centres choisis ne peuvent pas recevoir cet avis ici. Seuls les centres de test peuvent être choisis sur le site de test."],
    confirm: ["Confirm the send first.", "Confirmez d’abord l’envoi."],
    migration: ["This action needs a database update that is not applied yet.", "Cette action demande une mise à jour de la base de données qui n’est pas encore appliquée."],
    empty: ["There is nothing to export in this view.", "Rien à exporter dans cette vue."],
  };
  const pair = map[code] ?? ["Something went wrong. Try again, or open Help.", "Un problème est survenu. Réessayez ou ouvrez l’aide."];
  return locale === "fr" ? pair[1] : pair[0];
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, text, tone, locale }: { label: string; value: number | null; text?: string; tone?: string; locale: L }) {
  const shown = text ?? (value == null ? tx(locale, "Hidden (under 5)", "Masqué (moins de 5)") : value.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA"));
  return (
    <div className={`rounded-xl bg-surface p-4 ${TONE[tone ?? "ok"] ?? TONE.ok}`} data-ke="gov-desk-stat">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl whitespace-nowrap hyphens-none tabular-nums">{shown}</dd>
    </div>
  );
}

export function GovDeskPage({ data }: { data: GovDeskPageData }) {
  const locale = data.locale;
  const def = govPage(data.leaf);
  const asOf = formatGovAsOf(data.generatedAt, data.province, locale);
  const lead = def ? (locale === "fr" ? def.leadFr : def.leadEn) : "";
  return (
    <GovFrame locale={locale} section="overview" page={data.leaf} province={data.province} asOf={asOf} orgName={data.orgName}>
      <p className="mt-3 max-w-3xl text-base leading-6" data-ke="gov-desk-lead">{lead}</p>
      {data.readOnly ? (
        <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-border" data-ke="gov-desk-readonly">
          {tx(locale, "Read-only account: you can look and export, not change or send.", "Compte en lecture seule : vous pouvez consulter et exporter, mais pas modifier ni envoyer.")}
        </p>
      ) : null}
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted" data-ke="gov-desk-source" suppressHydrationWarning>
        {tx(locale, "Source", "Source")}: {data.source} {tx(locale, "Checked", "Vérifié")} {asOf}.
      </p>
      {data.state !== "live" ? <EmptyNote data={data} asOf={asOf} /> : null}
      {data.notes.length ? (
        <ul className="mt-3 max-w-3xl list-disc space-y-1 pl-5 text-sm leading-6" data-ke="gov-desk-notes">
          {data.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {data.stats.length ? (
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-ke="gov-desk-stats">
          {data.stats.map((stat) => (
            <Stat key={stat.key} label={stat.label} value={stat.value} text={stat.text} tone={stat.tone} locale={locale} />
          ))}
        </dl>
      ) : null}
      {data.leaf === "broadcasts" && data.state !== "off" ? <BroadcastComposer data={data} /> : null}
      {data.leaf === "notifications" && data.table?.rows.some((row) => !row.meta?.read) ? <MarkAllRead locale={locale} /> : null}
      {data.table && data.table.rows.length ? <DeskTable data={data} /> : null}
      <p className="mt-10">
        <a className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline" href={govPageHref(locale, "")}>
          {tx(locale, "Back to the overview", "Retour à l’aperçu")}
        </a>
      </p>
    </GovFrame>
  );
}

function EmptyNote({ data, asOf }: { data: GovDeskPageData; asOf: string }) {
  const locale = data.locale;
  const title =
    data.state === "off"
      ? tx(locale, "This tool is off", "Cet outil est éteint")
      : data.state === "unavailable"
        ? tx(locale, "Not available in your province yet", "Pas encore offert dans votre province")
        : tx(locale, "Nothing on file yet", "Rien au dossier pour l’instant");
  return (
    <section className="mt-4 max-w-3xl rounded-xl bg-surface-2 p-4" data-ke="gov-desk-empty" data-state={data.state}>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted" suppressHydrationWarning>
        {tx(locale, `Province: ${data.province}. Checked ${asOf}. Nothing is estimated or filled in.`, `Province : ${data.province}. Vérifié ${asOf}. Rien n’est estimé ni inventé.`)}
      </p>
    </section>
  );
}

function DeskTable({ data }: { data: GovDeskPageData }) {
  const locale = data.locale;
  const table = data.table!;
  const [needle, setNeedle] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState("");
  const rows = useMemo(() => {
    const q = needle.trim().toLowerCase();
    if (!q) return table.rows;
    return table.rows.filter((row) => row.cells.join(" ").toLowerCase().includes(q));
  }, [needle, table.rows]);
  const expandable = ["change-requests", "incidents", "complaints", "broadcasts", "notifications"].includes(data.leaf);
  return (
    <section className="mt-8" data-ke="gov-desk-table" aria-label={tx(locale, "Records", "Dossiers")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block w-full max-w-sm text-sm font-medium" htmlFor="gov-desk-filter">
          {tx(locale, "Filter this list", "Filtrer cette liste")}
          <input id="gov-desk-filter" className="ke-input mt-1 w-full" value={needle} onChange={(event) => setNeedle(event.target.value)} data-ke="gov-desk-filter" />
        </label>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium touch-manipulation"
          data-ke="gov-desk-export"
          onClick={() => {
            setExportNote("");
            void exportGovDeskCsv({ data: { leaf: data.leaf, locale } })
              .then((result) => {
                if (result.ok) download(result.filename, result.csv);
                else setExportNote(errorText(locale, result.error));
              })
              .catch(() => setExportNote(errorText(locale, "")));
          }}
        >
          {tx(locale, "Download CSV", "Télécharger le CSV")}
        </button>
      </div>
      {exportNote ? <p className="mt-2 text-sm" role="status">{exportNote}</p> : null}
      <p className="mt-2 text-sm text-muted" role="status" aria-live="polite">
        {tx(locale, `${rows.length} of ${table.rows.length} shown.`, `${rows.length} sur ${table.rows.length} affichés.`)}
        {table.countColumns.length ? ` ${tx(locale, "Groups under 5 are blank.", "Les groupes de moins de 5 sont vides.")}` : ""}
      </p>
      <div className="mt-3 w-full overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="bg-surface-2">
            <tr>
              {table.headers.map((header) => (
                <th key={header} scope="col" className="px-3 py-2 font-medium">{header}</th>
              ))}
              {expandable ? <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">{tx(locale, "Actions", "Actions")}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowView key={row.id} data={data} row={row} open={open === row.id} onToggle={() => setOpen(open === row.id ? null : row.id)} expandable={expandable} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowView({ data, row, open, onToggle, expandable }: { data: GovDeskPageData; row: GovDeskRow; open: boolean; onToggle: () => void; expandable: boolean }) {
  const locale = data.locale;
  const width = data.table!.headers.length + (expandable ? 1 : 0);
  const toneClass = row.tone === "bad" ? "border-l-4 border-l-red-600" : row.tone === "warn" ? "border-l-4 border-l-amber-500" : "";
  return (
    <>
      <tr className={`border-t border-border align-top ${toneClass}`} data-ke="gov-desk-row" data-tone={row.tone ?? ""}>
        {row.cells.map((cell, index) => (
          <td key={index} className="px-3 py-2">
            {cell == null ? <span className="text-muted">{tx(locale, "Hidden", "Masqué")}</span> : String(cell)}
          </td>
        ))}
        {expandable ? (
          <td className="px-3 py-2">
            <button type="button" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary touch-manipulation" aria-expanded={open} onClick={onToggle}>
              {open ? tx(locale, "Close", "Fermer") : tx(locale, "Open", "Ouvrir")}
            </button>
          </td>
        ) : null}
      </tr>
      {open ? (
        <tr className="border-t border-border bg-surface">
          <td colSpan={width} className="px-3 py-3">
            <RowDetail data={data} row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function useRefresh() {
  const router = useRouter();
  return () => void router.invalidate();
}

function RowDetail({ data, row }: { data: GovDeskPageData; row: GovDeskRow }): ReactNode {
  if (data.leaf === "change-requests") return <ChangeActions data={data} row={row} />;
  if (data.leaf === "incidents") return <IncidentDetail data={data} row={row} />;
  if (data.leaf === "complaints") return <ComplaintActions data={data} row={row} />;
  if (data.leaf === "broadcasts") return <BroadcastRow data={data} row={row} />;
  if (data.leaf === "notifications") return <NoticeRow data={data} row={row} />;
  return row.detail ? <p className="text-sm leading-6">{row.detail}</p> : null;
}

function ChangeActions({ data, row }: { data: GovDeskPageData; row: GovDeskRow }) {
  const locale = data.locale;
  const refresh = useRefresh();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const history = (data.extra.history ?? []).filter((event) => event.requestId === row.id);
  const reviewable = row.meta?.view === "to_review" && !data.readOnly;
  async function act(action: "approve" | "return" | "decline") {
    setBusy(true);
    setStatus("");
    try {
      const result = await govChangeDecision({ data: { id: row.id, action, note } });
      if (result.ok) {
        setStatus(tx(locale, "Saved.", "Enregistré."));
        refresh();
      } else setStatus(errorText(locale, result.error));
    } catch {
      setStatus(errorText(locale, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3" data-ke="gov-change-actions">
      {row.detail ? <p className="text-sm"><span className="font-medium">{tx(locale, "Note to centre", "Note au centre")}:</span> {row.detail}</p> : null}
      {history.length ? (
        <ol className="space-y-1 text-sm" data-ke="gov-change-history">
          {history.map((event, index) => (
            <li key={index}>
              {event.at} · {event.role === "government" ? tx(locale, "Province", "Province") : tx(locale, "Centre", "Centre")} · {event.action}
              {event.note ? ` · ${event.note}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">{tx(locale, "No review history yet.", "Aucun historique d’examen pour l’instant.")}</p>
      )}
      {reviewable ? (
        <>
          <label className="block text-sm font-medium" htmlFor={`note-${row.id}`}>
            {tx(locale, "Note to the centre (needed to return or decline)", "Note au centre (requise pour retourner ou refuser)")}
            <textarea id={`note-${row.id}`} className="ke-input mt-1 w-full" rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void act("approve")}>{tx(locale, "Approve", "Approuver")}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void act("return")}>{tx(locale, "Return to centre", "Retourner au centre")}</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void act("decline")}>{tx(locale, "Decline", "Refuser")}</Button>
          </div>
        </>
      ) : null}
      {status ? <p className="text-sm" role="status">{status}</p> : null}
    </div>
  );
}

type IncidentView = {
  id: string;
  centre: string;
  city: string;
  licence: string | null;
  kind: string;
  summary: string;
  awareAt: string;
  filedAt: string | null;
  dueAt: string;
  state: string;
  parentNoticeAt: string | null;
};

function IncidentDetail({ data, row }: { data: GovDeskPageData; row: GovDeskRow }) {
  const locale = data.locale;
  const refresh = useRefresh();
  const [item, setItem] = useState<IncidentView | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    void govIncidentDetail({ data: { id: row.id } })
      .then((result) => {
        if (!live) return;
        if (result.ok) setItem(result.incident);
        else setStatus(errorText(locale, result.error));
      })
      .catch(() => live && setStatus(errorText(locale, "")));
    return () => {
      live = false;
    };
  }, [row.id, locale]);
  return (
    <div className="space-y-2 text-sm" data-ke="gov-incident-detail">
      {item ? (
        <>
          <p className="font-medium">{item.centre}, {item.city}{item.licence ? ` · ${tx(locale, "Licence", "Permis")} ${item.licence}` : ""}</p>
          <p>{item.summary}</p>
          <ul className="space-y-1 text-muted">
            <li>{tx(locale, "Centre aware", "Connu du centre")}: {item.awareAt}</li>
            <li>{tx(locale, "Filing due", "Dépôt dû")}: {item.dueAt}</li>
            <li>{tx(locale, "Filed", "Déposé")}: {item.filedAt ?? tx(locale, "Not yet", "Pas encore")}</li>
            <li>{tx(locale, "Family told", "Famille avisée")}: {item.parentNoticeAt ?? tx(locale, "Not recorded", "Non noté")}</li>
          </ul>
          <p className="text-muted">{tx(locale, "The child’s name is never shown on the desk.", "Le nom de l’enfant n’est jamais affiché au bureau.")}</p>
          {!data.readOnly ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void govIncidentReviewed({ data: { id: row.id } })
                  .then((result) => {
                    setStatus(result.ok ? tx(locale, "Marked as reviewed.", "Marqué comme examiné.") : errorText(locale, result.error));
                    if (result.ok) refresh();
                  })
                  .catch(() => setStatus(errorText(locale, "")));
              }}
            >
              {tx(locale, "Mark as reviewed", "Marquer comme examiné")}
            </Button>
          ) : null}
        </>
      ) : !status ? (
        <p role="status">{tx(locale, "Opening the report…", "Ouverture du rapport…")}</p>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

function ComplaintActions({ data, row }: { data: GovDeskPageData; row: GovDeskRow }) {
  const locale = data.locale;
  const refresh = useRefresh();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const updates = (data.extra.updates ?? []).filter((update) => update.reportId === row.id);
  const isOpen = row.meta?.status === "open";
  async function send(extra: { close?: boolean; reopen?: boolean }) {
    setBusy(true);
    setStatus("");
    try {
      const result = await govComplaintUpdate({ data: { id: row.id, note, ...extra } });
      if (result.ok) {
        setNote("");
        setStatus(tx(locale, "Saved. The family sees the update in their account.", "Enregistré. La famille voit le suivi dans son compte."));
        refresh();
      } else setStatus(errorText(locale, result.error));
    } catch {
      setStatus(errorText(locale, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 text-sm" data-ke="gov-complaint-actions">
      {row.detail ? <p className="leading-6">{row.detail}</p> : null}
      {updates.length ? (
        <ol className="space-y-1">
          {updates.map((update, index) => (
            <li key={index}>{update.at} · {update.note}</li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">{tx(locale, "No update sent yet.", "Aucun suivi envoyé pour l’instant.")}</p>
      )}
      {!data.readOnly ? (
        <>
          <label className="block font-medium" htmlFor={`cu-${row.id}`}>
            {tx(locale, "Update for the family (no child names)", "Suivi pour la famille (aucun nom d’enfant)")}
            <textarea id={`cu-${row.id}`} className="ke-input mt-1 w-full" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void send({})}>{tx(locale, "Send update", "Envoyer le suivi")}</Button>
            {isOpen ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void send({ close: true })}>{tx(locale, "Close complaint", "Fermer la plainte")}</Button>
            ) : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void send({ reopen: true })}>{tx(locale, "Reopen", "Rouvrir")}</Button>
            )}
          </div>
        </>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

function NoticeRow({ data, row }: { data: GovDeskPageData; row: GovDeskRow }) {
  const locale = data.locale;
  const refresh = useRefresh();
  const [status, setStatus] = useState("");
  const href = typeof row.meta?.href === "string" ? row.meta.href : null;
  return (
    <div className="space-y-2 text-sm" data-ke="gov-notice-row">
      {row.detail ? <p className="leading-6">{row.detail}</p> : null}
      <div className="flex flex-wrap gap-2">
        {href ? (
          <a className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline" href={href}>
            {tx(locale, "Open the page", "Ouvrir la page")}
          </a>
        ) : null}
        {!row.meta?.read ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void govNotificationsRead({ data: { id: row.id } })
                .then((result) => {
                  if (result.ok) refresh();
                  else setStatus(errorText(locale, result.error));
                })
                .catch(() => setStatus(errorText(locale, "")));
            }}
          >
            {tx(locale, "Mark as read", "Marquer comme lu")}
          </Button>
        ) : null}
      </div>
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

function MarkAllRead({ locale }: { locale: L }) {
  const refresh = useRefresh();
  return (
    <p className="mt-6">
      <Button
        type="button"
        variant="secondary"
        data-ke="gov-notices-all-read"
        onClick={() => {
          void govNotificationsRead({ data: { all: true } }).then(() => refresh());
        }}
      >
        {tx(locale, "Mark all as read", "Tout marquer comme lu")}
      </Button>
    </p>
  );
}

function BroadcastComposer({ data, draft }: { data: GovDeskPageData; draft?: GovDeskRow }) {
  const locale = data.locale;
  const refresh = useRefresh();
  const centres = data.extra.centres ?? [];
  const [title, setTitle] = useState(draft ? String(draft.meta?.title ?? "") : "");
  const [body, setBody] = useState(draft?.detail ?? "");
  const [picked, setPicked] = useState<string[]>(draft && typeof draft.meta?.targets === "string" && draft.meta.targets ? draft.meta.targets.split(",") : []);
  const [needle, setNeedle] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  if (data.readOnly) return null;
  const shown = centres.filter((centre) => `${centre.name} ${centre.city}`.toLowerCase().includes(needle.trim().toLowerCase())).slice(0, 60);
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const result = await govSaveBroadcast({ data: { id: draft?.id, title, body, centreIds: picked } });
      if (result.ok) {
        setStatus(tx(locale, "Draft saved. Nothing was sent.", "Brouillon enregistré. Rien n’a été envoyé."));
        if (!draft) {
          setTitle("");
          setBody("");
          setPicked([]);
        }
        refresh();
      } else setStatus(errorText(locale, result.error));
    } catch {
      setStatus(errorText(locale, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={draft ? "space-y-3" : "mt-8 max-w-3xl space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"} data-ke="gov-broadcast-compose">
      {!draft ? <h2 className="font-display text-xl">{tx(locale, "Write a notice", "Rédiger un avis")}</h2> : null}
      <label className="block text-sm font-medium" htmlFor={`bt-${draft?.id ?? "new"}`}>
        {tx(locale, "Title", "Titre")}
        <input id={`bt-${draft?.id ?? "new"}`} className="ke-input mt-1 w-full" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block text-sm font-medium" htmlFor={`bb-${draft?.id ?? "new"}`}>
        {tx(locale, "Notice (no child names)", "Avis (aucun nom d’enfant)")}
        <textarea id={`bb-${draft?.id ?? "new"}`} className="ke-input mt-1 w-full" rows={4} maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{tx(locale, `Centres (${picked.length} picked)`, `Centres (${picked.length} choisis)`)}</legend>
        {centres.length ? (
          <>
            <input className="ke-input w-full" aria-label={tx(locale, "Find a centre", "Trouver un centre")} placeholder={tx(locale, "Find a centre", "Trouver un centre")} value={needle} onChange={(event) => setNeedle(event.target.value)} />
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {shown.map((centre) => (
                <li key={centre.id}>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.includes(centre.id)}
                      onChange={(event) => setPicked(event.target.checked ? [...picked, centre.id] : picked.filter((id) => id !== centre.id))}
                    />
                    {centre.name}, {centre.city}
                    {centre.qa ? ` · ${tx(locale, "test centre", "centre de test")}` : ""}
                    {!centre.email ? ` · ${tx(locale, "no email on file", "aucun courriel au dossier")}` : ""}
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">{tx(locale, "No centre can be picked here.", "Aucun centre ne peut être choisi ici.")}</p>
        )}
      </fieldset>
      <Button type="button" disabled={busy} onClick={() => void save()}>{tx(locale, "Save draft", "Enregistrer le brouillon")}</Button>
      {status ? <p className="text-sm" role="status">{status}</p> : null}
    </section>
  );
}

function BroadcastRow({ data, row }: { data: GovDeskPageData; row: GovDeskRow }) {
  const locale = data.locale;
  const refresh = useRefresh();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const isDraft = row.meta?.status === "draft";
  const targets = typeof row.meta?.targets === "string" && row.meta.targets ? row.meta.targets.split(",").length : 0;
  const live = data.extra.mode === "live";
  if (!isDraft || data.readOnly) return row.detail ? <p className="text-sm leading-6">{row.detail}</p> : null;
  return (
    <div className="space-y-4" data-ke="gov-broadcast-row">
      <BroadcastComposer data={data} draft={row} />
      {!confirming ? (
        <Button type="button" variant="secondary" disabled={!targets} onClick={() => setConfirming(true)}>
          {tx(locale, `Send to ${targets} centres…`, `Envoyer à ${targets} centres…`)}
        </Button>
      ) : (
        <div className="rounded-xl bg-surface-2 p-3 text-sm" role="alertdialog" aria-label={tx(locale, "Confirm the send", "Confirmer l’envoi")} data-ke="gov-broadcast-confirm">
          <p>
            {live
              ? tx(locale, `This emails ${targets} picked centres now. It cannot be undone.`, `Ceci écrit maintenant aux ${targets} centres choisis. C’est définitif.`)
              : tx(locale, `Practice mode: this records a send to ${targets} centres. No email goes out.`, `Mode pratique : ceci note un envoi à ${targets} centres. Aucun courriel ne part.`)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void govSendBroadcast({ data: { id: row.id, confirm: "SEND" } })
                  .then((result) => {
                    if (result.ok) {
                      setStatus(tx(locale, `Done. Sent ${result.sent}, recorded ${result.logged}, skipped ${result.skipped} (no email).`, `Terminé. Envoyés ${result.sent}, notés ${result.logged}, ignorés ${result.skipped} (sans courriel).`));
                      refresh();
                    } else setStatus(errorText(locale, result.error));
                  })
                  .catch(() => setStatus(errorText(locale, "")))
                  .finally(() => {
                    setBusy(false);
                    setConfirming(false);
                  });
              }}
            >
              {tx(locale, "Yes, send", "Oui, envoyer")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>{tx(locale, "Cancel", "Annuler")}</Button>
          </div>
        </div>
      )}
      {status ? <p className="text-sm" role="status">{status}</p> : null}
    </div>
  );
}
