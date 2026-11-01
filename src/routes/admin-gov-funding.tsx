import { createFileRoute } from "@tanstack/react-router";
import { GovFundingPage } from "@/components/compliance/funding-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminFunding } from "@/lib/server/compliance-funding";
export const Route = createFileRoute("/admin-gov-funding")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminFunding({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Funding reports · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovFundingPage data={Route.useLoaderData()} locale="en" />; }
