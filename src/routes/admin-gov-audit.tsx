import { createFileRoute } from "@tanstack/react-router";
import { GovAuditPage } from "@/components/compliance/audit-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminAudit } from "@/lib/server/compliance-audit";
export const Route = createFileRoute("/admin-gov-audit")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminAudit({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Audit log · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <GovAuditPage data={Route.useLoaderData()} locale="en" />; }
