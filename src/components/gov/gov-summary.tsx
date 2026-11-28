import { govPageHref, govPageTitle } from "@/lib/gov/desk";
import type { loadGovSummary } from "@/lib/server/gov-desk";

export type GovSummaryData = Awaited<ReturnType<typeof loadGovSummary>>;

export function GovSummary({ locale, data }: { locale: "en" | "fr"; data?: GovSummaryData }) {
  const fr = locale === "fr";
  const hidden = fr ? "Non affiché" : "Withheld";
  const unavailable = fr ? "Données indisponibles" : "Data unavailable";
  const localeTag = fr ? "fr-CA" : "en-CA";
  const labels: Record<string, { en: string; fr: string }> = {
    export: { en: "Access", fr: "Accès" },
    delete: { en: "Deletion", fr: "Effacement" },
    received: { en: "Received", fr: "Reçue" },
    with_roles: { en: "In progress", fr: "En cours" },
    blocked: { en: "Blocked", fr: "Bloquée" },
    done: { en: "Complete", fr: "Terminée" },
  };
  const label = (value: string | number | null) => labels[String(value)]?.[locale] ?? value;
  const requestsHref = govPageHref(locale, "data-requests");
  const changeHref = govPageHref(locale, "change-requests");
  const complianceHref = govPageHref(locale, "compliance");

  return (
    <section className="mt-4" data-ke="gov-summary" aria-labelledby="gov-summary-heading">
      <h2 id="gov-summary-heading" className="sr-only">{fr ? "Aujourd’hui en bref" : "Today at a glance"}</h2>
      {data ? (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-ke="gov-summary-tiles">
          {data.items.map((item) => (
            <li key={item.leaf}>
              <a href={govPageHref(locale, item.leaf)} className="flex h-full min-h-20 flex-col rounded-xl bg-surface p-3 ring-1 ring-border hover:bg-surface-2 touch-manipulation" data-ke="gov-summary-tile">
                <span className="font-display text-2xl tabular-nums">{item.state === "live" ? item.value?.toLocaleString(localeTag) ?? "—" : "—"}</span>
                <span className="text-sm font-semibold">{govPageTitle(item.leaf, locale)}</span>
                <span className="text-sm text-muted">
                  {item.state === "live" ? (item.value === null ? hidden : item.label) : unavailable}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted" role="status">{unavailable}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="gov-attention-queue">
          <h3 className="font-display text-lg">{fr ? "À traiter" : "Needs attention"}</h3>
          {data?.attention.length ? (
            <ul className="mt-2 divide-y divide-border">
              {data.attention.map((row) => (
                <li key={row.id}>
                  <a href={govPageHref(locale, row.leaf)} className="flex min-h-11 flex-wrap items-start justify-between gap-2 py-2 touch-manipulation hover:underline">
                    <div>
                      <p className="font-semibold">{row.centre}</p>
                      <p className="text-sm text-muted">{[row.task, row.city, row.date].filter(Boolean).join(" · ")}</p>
                      <p className="text-sm text-muted">{row.source}</p>
                    </div>
                    <span className="rounded-full bg-surface-2 px-2 py-1 text-sm">{row.status}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">{fr ? "Aucun dossier à afficher ici." : "No items to show here."}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4">
            <a href={complianceHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">{govPageTitle("compliance", locale)}</a>
            <a href={changeHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">{govPageTitle("change-requests", locale)}</a>
          </div>
        </section>
        <section className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="gov-data-request-queue">
          <h3 className="font-display text-lg">{govPageTitle("data-requests", locale)}</h3>
          {data?.requests.length ? (
            <ul className="mt-2 divide-y divide-border">
              {data.requests.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{label(row.kind)} · {label(row.status)}</span>
                  <span>{row.count?.toLocaleString(localeTag) ?? hidden}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted">{fr ? "Aucune demande à afficher ici." : "No requests to show here."}</p>}
          <p className="mt-2 text-sm text-muted">{data?.items.find((item) => item.leaf === "data-requests")?.source}</p>
          <a href={requestsHref} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
            {fr ? "Voir les demandes" : "View requests"}
          </a>
        </section>
      </div>
    </section>
  );
}
