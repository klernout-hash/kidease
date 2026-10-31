import { createFileRoute } from "@tanstack/react-router";
import { pageSeoHead } from "@/lib/page-seo";
import { parseVacancyProvince } from "@/lib/vacancy-history";
import { loadVacancyIndex } from "@/lib/server/vacancy-index";
import { VacancyIndexView } from "@/routes/vacancy-index";

export const Route = createFileRoute("/fr/vacancy-index")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: parseVacancyProvince(search.province),
  }),
  loaderDeps: ({ search }) => ({ province: search.province }),
  loader: ({ deps }) => loadVacancyIndex(deps.province),
  head: () =>
    pageSeoHead({
      title: "Places ouvertes par province · KidEase",
      description:
        "Fiches publiques KidEase par province et par âge. Places ouvertes confirmées seulement. Les frais ne sont pas sur cette page.",
      path: "/fr/vacancy-index",
    }),
  component: FrVacancyIndexPage,
});

function FrVacancyIndexPage() {
  const data = Route.useLoaderData();
  return <VacancyIndexView data={data} />;
}
