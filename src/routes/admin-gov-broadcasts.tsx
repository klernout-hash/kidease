import { createFileRoute } from "@tanstack/react-router";
import { GovBroadcastPage } from "@/components/compliance/broadcast-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminBroadcasts } from "@/lib/server/compliance-broadcast";
export const Route = createFileRoute("/admin-gov-broadcasts")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminBroadcasts(),
  head: () => ({ meta: [{ title: "Emergency notice · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovBroadcastPage data={Route.useLoaderData()} locale="en" admin />; }
