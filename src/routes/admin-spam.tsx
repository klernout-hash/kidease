import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listSpamQueue } from "@/lib/server/admin-tools";
import { listFraudFlags } from "@/lib/server/fraud-queue";
import { AdminToolFrame } from "@/components/admin-tool-frame";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin-spam")({
  beforeLoad: beforeLoadAdminDesk,
  loader: async () => {
    const spam = await listSpamQueue();
    const fraud = await listFraudFlags();
    return { spam, fraud };
  },
  head: () => ({
    meta: [
      { title: "Spam and fraud · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SpamPage,
});

function SpamPage() {
  const data = Route.useLoaderData();
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const fraud = (
    <section className="mt-6" data-ke="fraud-review">
      <h2 className="font-display text-xl">{fr ? "Vérification des réclamations et avis" : "Claim and review checks"}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {fr
          ? "Un score bas reste en attente. KidEase n’approuve pas la réclamation tout seul."
          : "A low score stays in review. KidEase does not approve the claim on its own."}
      </p>
      {data.fraud.length ? (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {data.fraud.map((row) => (
            <li key={row.id} className="p-4 text-sm">
              <p className="font-medium">
                {row.kind}
                {row.score != null ? ` · ${row.score}` : ""}
              </p>
              <p className="mt-1 text-muted">{row.reasons}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{fr ? "Rien à revoir." : "Nothing to review."}</p>
      )}
    </section>
  );
  return (
    <AdminToolFrame title={t("adminSpamTitle")} lead={t("adminSpamLead")} on={data.spam.on} notice={fraud}>
      {data.spam.rows.length ? (
        <ul className="mt-6 space-y-3">
          {data.spam.rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border">
              <p className="text-sm font-medium">
                {row.kind} · {row.score}
              </p>
              <p className="mt-1 text-sm text-muted">{row.reasons}</p>
              <p className="mt-2 text-sm">{row.excerpt}</p>
              {row.email ? <p className="mt-1 text-sm text-muted">{row.email}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">{t("adminSpamEmpty")}</p>
      )}
    </AdminToolFrame>
  );
}
