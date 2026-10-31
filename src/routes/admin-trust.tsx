import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminToolFrame } from "@/components/admin-tool-frame";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadTrustQueue } from "@/lib/server/trust-safety";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin-trust")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadTrustQueue(),
  head: () => ({
    meta: [
      { title: "Trust queue · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TrustQueuePage,
});

function TrustQueuePage() {
  const data = Route.useLoaderData();
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <AdminToolFrame
      title={fr ? "Confiance" : "Trust"}
      lead={fr ? "File d’examen. Le site web seulement." : "Review queue. Website only."}
      on={data.enabled}
    >
      <p className="max-w-prose text-sm text-muted">
        {fr
          ? "Les signalements ouverts visent 24 heures. L’identité Stripe reste optionnelle et éteinte tant que son drapeau est à off."
          : "Open reports aim for 24 hours. Stripe Identity stays optional and off until its own flag is on."}
      </p>
      {!data.enabled ? (
        <p className="mt-4 text-sm" role="status">
          {fr ? "Cette file est éteinte." : "This queue is off."}{" "}
          <Link to="/trust-safety" className="font-medium text-primary underline-offset-4 hover:underline">
            {fr ? "Lire la page publique" : "Read the public page"}
          </Link>
        </p>
      ) : (
        <>
          <h2 className="mt-6 font-display text-xl">{fr ? "Signalements" : "Reports"}</h2>
          {data.reports.length === 0 ? (
            <p className="mt-2 text-sm">{fr ? "Aucun signalement ouvert." : "No open reports."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
              {data.reports.map((row) => (
                <li key={row.id} className="p-4 text-sm">
                  <p className="font-medium">{row.reason}</p>
                  <p>
                    {row.sla === "over"
                      ? fr
                        ? "En retard sur 24 heures"
                        : "Past 24 hours"
                      : row.sla === "due_soon"
                        ? fr
                          ? "Bientôt dû"
                          : "Due soon"
                        : fr
                          ? "Dans le délai"
                          : "Inside the window"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-6 font-display text-xl">{fr ? "Identité des propriétaires" : "Owner identity"}</h2>
          {data.identity.length === 0 ? (
            <p className="mt-2 text-sm">{fr ? "Aucun document en attente." : "No documents waiting."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
              {data.identity.map((row) => (
                <li key={row.id} className="p-4 text-sm">
                  {row.kind} · {row.daycareId}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AdminToolFrame>
  );
}
