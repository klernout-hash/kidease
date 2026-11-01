import { createFileRoute } from "@tanstack/react-router";
import { ParentIncidentsPage } from "@/components/compliance/incidents-page";
import { loadParentIncidents } from "@/lib/server/compliance-incidents";

const EMPTY = { enabled: false as const, mode: "off" as const, rows: [] };

export const Route = createFileRoute("/family-incidents")({
  loader: () => loadParentIncidents().catch(() => EMPTY),
  head: () => ({
    meta: [
      { title: "Daycare notes · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  return <ParentIncidentsPage data={data} locale="en" />;
}
