import { createFileRoute } from "@tanstack/react-router";
import { GovDemandPage } from "@/components/compliance/demand-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminDemand } from "@/lib/server/compliance-demand";
export const Route = createFileRoute("/admin-gov-demand")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminDemand({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Space demand · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovDemandPage data={Route.useLoaderData()} locale="en" />; }
