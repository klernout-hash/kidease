import { createFileRoute } from "@tanstack/react-router";
import { QcHomeDirectory } from "@/components/qc-home-directory";
import { pageSeoHead } from "@/lib/page-seo";
import { listQcHomeDaycares } from "@/lib/server/qc-home-daycares";

export const Route = createFileRoute("/fr/milieux-familiaux")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listQcHomeDaycares({ data: { q: deps.q, locale: "fr" } }),
  head: ({ loaderData }) => {
    const seo = pageSeoHead({
      title: "Milieux familiaux reconnus au Québec · KidEase",
      description:
        "KidEase est une entreprise canadienne. Milieux familiaux reconnus, par municipalité, sans adresse de rue.",
      path: "/fr/milieux-familiaux",
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
  return <QcHomeDirectory locale="fr" enabled={data.enabled} rows={data.rows} error={data.error} q={q} />;
}
