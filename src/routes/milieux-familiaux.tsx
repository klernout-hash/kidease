import { createFileRoute } from "@tanstack/react-router";
import { QcHomeDirectory } from "@/components/qc-home-directory";
import { pageSeoHead } from "@/lib/page-seo";
import { listQcHomeDaycares } from "@/lib/server/qc-home-daycares";

export const Route = createFileRoute("/milieux-familiaux")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listQcHomeDaycares({ data: { q: deps.q, locale: "en" } }),
  head: ({ loaderData }) => {
    const seo = pageSeoHead({
      title: "Recognized home daycares in Quebec · KidEase",
      description:
        "KidEase is a Canadian company. Recognized Quebec home daycares, shown by town, without a street address.",
      path: "/milieux-familiaux",
    });
    if (!loaderData?.enabled) {
      seo.meta.push({ name: "robots", content: "noindex, nofollow" });
    }
    return seo;
  },
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  const { q } = Route.useSearch();
  return <QcHomeDirectory locale="en" enabled={data.enabled} rows={data.rows} error={data.error} q={q} />;
}
