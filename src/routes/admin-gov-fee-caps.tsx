import { createFileRoute } from "@tanstack/react-router";
import { GovFeesPage } from "@/components/compliance/fees-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminFees } from "@/lib/server/compliance-fees";
export const Route = createFileRoute("/admin-gov-fee-caps")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminFees({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Fee caps · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovFeesPage data={Route.useLoaderData()} locale="en" />; }
