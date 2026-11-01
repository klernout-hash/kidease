import { createFileRoute } from "@tanstack/react-router";
import { GovRatiosPage } from "@/components/compliance/ratios-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminRatios } from "@/lib/server/compliance-ratios";
export const Route = createFileRoute("/admin-gov-ratios")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminRatios({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Room ratios · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovRatiosPage data={Route.useLoaderData()} locale="en" />; }
