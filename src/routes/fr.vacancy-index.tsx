import { createFileRoute } from "@tanstack/react-router";
import { VacancyIndexPage } from "@/components/vacancy-index-page";
import { pageSeoHead } from "@/lib/page-seo";
import { loadVacancyIndex } from "@/lib/server/vacancy-index";
import type { VacancyIndex } from "@/lib/vacancy-index";

export const Route = createFileRoute("/fr/vacancy-index")({
  loader: async () => {
    try {
      const index = await loadVacancyIndex();
      return { index, failed: false as const };
    } catch {
      return { index: null as VacancyIndex | null, failed: true as const };
    }
  },
  head: () =>
    pageSeoHead({
      title: "Indice canadien des places en garde · KidEase",
      description:
        "Comptes en direct des fiches publiques KidEase, des places ouvertes et des frais mensuels, par province et groupe d'âge.",
      path: "/fr/vacancy-index",
    }),
  component: FrVacancyIndexRoute,
});

function FrVacancyIndexRoute() {
  const data = Route.useLoaderData();
  return <VacancyIndexPage locale="fr" index={data.index} failed={data.failed} />;
}
