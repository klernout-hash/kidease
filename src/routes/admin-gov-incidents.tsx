import { createFileRoute } from "@tanstack/react-router";
import { GovIncidentsPage } from "@/components/compliance/incidents-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminIncidents } from "@/lib/server/compliance-incidents";

export const Route = createFileRoute("/admin-gov-incidents")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminIncidents({ data: { province: "ON" } }),
  head: () => ({
    meta: [
      { title: "Serious occurrences · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  return <GovIncidentsPage data={data} locale="en" />;
}
