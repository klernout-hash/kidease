import { createFileRoute } from "@tanstack/react-router";
import { ParentComplaintsPage } from "@/components/compliance/complaints-page";
import { loadParentComplaints } from "@/lib/server/compliance-complaints";
const EMPTY = { enabled: false as const, mode: "off" as const, rows: [] };
export const Route = createFileRoute("/family-complaints")({
  loader: () => loadParentComplaints().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Licensing complaint · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <ParentComplaintsPage data={Route.useLoaderData()} locale="en" />; }
