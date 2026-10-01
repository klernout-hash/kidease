import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listSupportDrafts } from "@/lib/server/admin-tools";
import { AdminToolFrame } from "@/components/admin-tool-frame";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/admin-triage")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listSupportDrafts(),
  head: () => ({
    meta: [
      { title: "Support drafts · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TriagePage,
});

function TriagePage() {
  const data = Route.useLoaderData();
  const { t } = useCopy();
  return (
    <AdminToolFrame title={t("adminTriageTitle")} lead={t("adminTriageLead")} on={data.on}>
      {data.rows.length ? (
        <ul className="mt-6 space-y-3">
          {data.rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border">
              <p className="text-sm font-medium">{row.tag}</p>
              <p className="mt-2 text-sm">{row.draft}</p>
              <p className="mt-2 text-xs text-subtle">{t("adminTriageNotSent")}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">{t("adminTriageEmpty")}</p>
      )}
    </AdminToolFrame>
  );
}
