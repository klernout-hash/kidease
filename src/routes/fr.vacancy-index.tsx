import { createFileRoute } from "@tanstack/react-router";
import { pageSeoHead } from "@/lib/page-seo";
import { loadVacancyIndex } from "@/lib/server/vacancy-index";
import { VacancyIndexView } from "@/routes/vacancy-index";

export const Route = createFileRoute("/fr/vacancy-index")({
  loader: () => loadVacancyIndex(),
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
