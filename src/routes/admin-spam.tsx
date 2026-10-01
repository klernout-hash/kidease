import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listSpamQueue } from "@/lib/server/admin-tools";
import { AdminToolFrame } from "@/components/admin-tool-frame";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin-spam")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listSpamQueue(),
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
  const { t } = useCopy();
  return (
    <AdminToolFrame title={t("adminSpamTitle")} lead={t("adminSpamLead")} on={data.on}>
      {data.rows.length ? (
        <ul className="mt-6 space-y-3">
          {data.rows.map((row) => (
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
