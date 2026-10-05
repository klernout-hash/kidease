import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { CitiesPage, citiesLoader } from "@/routes/cities";

export const Route = createFileRoute("/fr/cities")({
  loader: citiesLoader,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.cities),
  component: FrCities,
});

function FrCities() {
  return <CitiesPage counts={Route.useLoaderData()} />;
}
