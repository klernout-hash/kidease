import { createFileRoute, Link } from "@tanstack/react-router";
import { WiringDesk } from "@/components/wiring-desk";
import { Button } from "@/components/ui/button";
import { ToolError, ToolPending } from "@/components/tool-states";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { listCentreAbsences } from "@/lib/server/child-checkin";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/provider_/absence")({
  validateSearch: (search: Record<string, unknown>) => ({
    centre: typeof search.centre === "string" ? search.centre : undefined,
    day: typeof search.day === "string" ? search.day : undefined,
  }),
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  loaderDeps: ({ search }) => ({ centre: search.centre, day: search.day }),
  loader: ({ deps }) => listCentreAbsences({ data: deps }),
  head: () => ({ meta: [{ title: "Absences · KidEase" }, { name: "robots", content: "noindex" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: CentreAbsencePage,
});

const ratioLabels = {
  en: { ok: "Within limit", near: "Near the limit", out: "Over the limit", unknown: "Unavailable" },
  fr: { ok: "Dans la limite", near: "Près de la limite", out: "Au-dessus de la limite", unknown: "Indisponible" },
};

function CentreAbsencePage() {
  const { centres, selected, day, rows }: Awaited<ReturnType<typeof listCentreAbsences>> = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const { day: requestedDay } = Route.useSearch();
  const { locale, t } = useCopy();
  const fr = locale === "fr";
  const dateLabel = day ? new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(day)) : "";

  return (
    <WiringDesk
      kicker="KidEase"
      title={fr ? "Absences à la garderie" : "Daycare absences"}
      lead={fr ? "Consultez les absences signalées par les parents pour prévoir votre journée." : "See which children will be away so you can plan your day."}
      next={centres.length > 1 ? (fr ? "Choisissez votre centre." : "Choose your centre.") : ""}
      enabled
    >
      {centres.length > 1 && (
        <div className="mb-6">
          <label htmlFor="absence-centre" className="block text-sm font-medium">
            Centre
          </label>
          <select
            id="absence-centre"
            value={selected ?? ""}
            onChange={(event) => void navigate({ search: { centre: event.target.value, day: requestedDay } })}
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {!selected && <option value="">{fr ? "Choisir un centre" : "Choose a centre"}</option>}
            {centres.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}
          </select>
        </div>
      )}
      {selected ? (
        <section aria-label={fr ? "Absences signalées" : "Reported absences"}>
          <h2 className="font-semibold">{centres.find((centre) => centre.id === selected)?.name} · {dateLabel}</h2>
          {rows.length ? (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {rows.map((row) => (
                <li key={row.id} className="space-y-1 p-4">
                  <p className="break-words font-semibold">{row.child_name}</p>
                  <p>{t(row.status === "sick" ? "careSick" : row.status === "vacation" ? "careVacation" : "careAbsent")}</p>
                  {row.ratio_status && (
                    <p className="text-sm text-muted">
                      {fr ? "Ratio du groupe au moment de l’avis" : "Group ratio when reported"}{" · "}
                      {ratioLabels[fr ? "fr" : "en"][row.ratio_status]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2">{fr ? "Aucune absence signalée pour cette journée." : "No absences reported for this day."}</p>}
        </section>
      ) : <p>{fr ? "Ce centre n’est pas accessible avec ce compte." : "This centre is unavailable to this account."}</p>}
      <Button asChild className="mt-6 min-h-11 touch-manipulation">
        <Link to="/provider" search={{ desk: "today", centre: selected ?? undefined }}>
          {fr ? "Retour à Aujourd’hui" : "Back to Today"}
        </Link>
      </Button>
    </WiringDesk>
  );
}
