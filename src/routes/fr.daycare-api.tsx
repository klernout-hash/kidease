import { createFileRoute } from "@tanstack/react-router";
import { ApiDocs } from "@/routes/daycare-api";
import { centreApiEnabled } from "@/lib/features";

export const Route = createFileRoute("/fr/daycare-api")({
  loader: () => ({ apiOn: centreApiEnabled() }),
  head: () => ({
    meta: [
      { title: "API du centre · KidEase" },
      {
        name: "description",
        content: "Comment un centre lit et met à jour ses familles.",
      },
    ],
  }),
  component: FrenchApiDocs,
});

function FrenchApiDocs() {
  const { apiOn } = Route.useLoaderData();
  return <ApiDocs french apiOn={apiOn} />;
}
