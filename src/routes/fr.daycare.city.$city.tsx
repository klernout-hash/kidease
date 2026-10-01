import { createFileRoute } from "@tanstack/react-router";
import { CityHubNotFoundPage } from "@/components/page-not-found";
import { CityHubPage } from "@/routes/daycare.city.$city";
import { cityHubHead, loadCityHub } from "@/lib/city-hub-page";

export const Route = createFileRoute("/fr/daycare/city/$city")({
  loader: ({ params }) => loadCityHub(params.city),
  notFoundComponent: CityHubNotFoundPage,
  head: ({ loaderData }) => cityHubHead(loaderData, "fr"),
  component: FrenchCityHubPage,
});

function FrenchCityHubPage() {
  const hub = Route.useLoaderData();
  return <CityHubPage hub={hub} />;
}
