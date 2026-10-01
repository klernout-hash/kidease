import { createFileRoute } from "@tanstack/react-router";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { listProvincialVacancyReport } from "@/lib/server/provincial-vacancy";
import { useCopy } from "@/lib/use-copy";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/admin-vacancies")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => listProvincialVacancyReport(),
  head: () => ({
    meta: [
      { title: "Provincial openings · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProvincialVacancyPage,
});

function when(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

function ProvincialVacancyPage() {
  const report = Route.useLoaderData();
  const { t } = useCopy();
  const sections = [
    ["Matched", report.matched],
    ["Unmatched", report.unmatched],
    ["Changed", report.changed],
  ] as const;
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl">{t("adminVacancyTitle")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">{t("adminVacancyLead")}</p>
        <p className="mt-2 text-sm text-muted">
          New Brunswick's published file lists licensed capacity, not current openings. When that file has no opening column, the import is marked failed and no number is written.
        </p>
        {report.runs.length ? (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
            {report.runs.map((run, i) => (
              <li key={`${run.province}-${run.fetched_at}-${i}`} className="p-4 text-sm">
                <p className="font-medium">
                  {run.province} · {run.status}
                  {run.dry_run ? " · dry run" : ""}
                </p>
                <p className="mt-1 text-muted">
                  Matched {run.matched} · Unmatched {run.unmatched} · Changed {run.changed}
                  {run.reason ? ` · ${run.reason}` : ""}
                </p>
                <p className="mt-1 text-xs text-subtle">{when(String(run.fetched_at))} · {run.source_url}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("adminVacancyEmpty")}</p>
        )}
        {sections.map(([title, rows]) => (
          <section key={title} className="mt-8">
            <h2 className="font-display text-xl">{title}</h2>
            {rows.length ? (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
                {rows.map((row, i) => (
                  <li key={`${title}-${row.licence || row.source_name}-${i}`} className="p-4 text-sm">
                    <p className="font-medium">{row.source_name}</p>
                    <p className="mt-1 text-muted">
                      {row.province}
                      {row.source_city ? ` · ${row.source_city}` : ""}
                      {row.licence ? ` · ${row.licence}` : ""}
                      {row.total != null ? ` · ${row.total}` : ""}
                      {row.age_label ? ` · ${row.age_label}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{when(String(row.fetched_at))}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">None in this sample.</p>
            )}
          </section>
        ))}
      </main>
    </Shell>
  );
}
