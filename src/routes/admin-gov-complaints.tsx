import { createFileRoute } from "@tanstack/react-router";
import { GovComplaintsPage } from "@/components/compliance/complaints-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminComplaints } from "@/lib/server/compliance-complaints";
export const Route = createFileRoute("/admin-gov-complaints")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminComplaints({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Complaints · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovComplaintsPage data={Route.useLoaderData()} locale="en" />; }
