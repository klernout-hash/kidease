import { createFileRoute } from "@tanstack/react-router";
import { CentreIncidentsPage } from "@/components/compliance/incidents-page";
import { loadCentreIncidents } from "@/lib/server/compliance-incidents";

const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };

export const Route = createFileRoute("/centre-incidents")({
  loader: () => loadCentreIncidents().catch(() => EMPTY),
  head: () => ({
    meta: [
      { title: "Serious occurrence · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  return <CentreIncidentsPage data={data} locale="en" />;
}
