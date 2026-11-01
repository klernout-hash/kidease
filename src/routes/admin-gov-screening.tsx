import { createFileRoute } from "@tanstack/react-router";
import { GovScreeningPage } from "@/components/compliance/screening-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminScreening } from "@/lib/server/compliance-screening";

export const Route = createFileRoute("/admin-gov-screening")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminScreening({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Staff screening · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  return <GovScreeningPage data={Route.useLoaderData()} locale="en" />;
}
