import { createFileRoute } from "@tanstack/react-router";
import { VacancyIndexPage } from "@/components/vacancy-index-page";
import { pageSeoHead } from "@/lib/page-seo";
import { loadVacancyIndex } from "@/lib/server/vacancy-index";
import type { VacancyIndex } from "@/lib/vacancy-index";

export const Route = createFileRoute("/vacancy-index")({
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
      title: "Canadian Childcare Vacancy Index · KidEase",
      description:
        "Live counts of public KidEase listings, open spots, and monthly fees by province and age group. Not a government census.",
      path: "/vacancy-index",
    }),
  component: VacancyIndexRoute,
});

function VacancyIndexRoute() {
  const data = Route.useLoaderData();
  return <VacancyIndexPage locale="en" index={data.index} failed={data.failed} />;
}
