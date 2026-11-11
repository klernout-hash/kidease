import { createFileRoute } from "@tanstack/react-router";
import { ApiDocs } from "@/routes/daycare-api";

export const Route = createFileRoute("/fr/daycare-api")({
  head: () => ({
    meta: [
      { title: "API du centre · KidEase" },
      {
        name: "description",
        content: "Comment un centre lit et met à jour ses familles. L’API est fermée jusqu’à ce que KidEase l’ouvre.",
      },
    ],
  }),
  component: FrenchApiDocs,
});

function FrenchApiDocs() {
  return <ApiDocs french />;
}
