import { createFileRoute, notFound } from "@tanstack/react-router";
import { AgeVacancyView } from "@/routes/daycare.$city.$age";
import { ageVacancyMeta } from "@/lib/age-vacancy-copy";
import { ageVacancyPath } from "@/lib/age-vacancy";
import { loadAgeVacancyPage } from "@/lib/server/age-vacancy";
import { pageSeoHead } from "@/lib/page-seo";
import { CityHubNotFoundPage } from "@/components/page-not-found";

export const Route = createFileRoute("/fr/daycare/$city/$age")({
  loader: async ({ params }) => {
    const page = await loadAgeVacancyPage(params.city, params.age);
    if (!page) throw notFound();
    return page;
  },
  notFoundComponent: CityHubNotFoundPage,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Garderie · KidEase" }] };
    const meta = ageVacancyMeta("fr", loaderData);
    return pageSeoHead({ ...meta, path: `/fr${ageVacancyPath(loaderData.citySlug, loaderData.age)}` });
  },
  component: FrAgeVacancyPage,
});

function FrAgeVacancyPage() {
  const page = Route.useLoaderData();
  return <AgeVacancyView page={page} />;
}
