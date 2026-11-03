import { createFileRoute } from "@tanstack/react-router";
import { CentreScreeningPage } from "@/components/compliance/screening-page";
import { loadCentreScreening } from "@/lib/server/compliance-screening";
import { ToolError, ToolPending } from "@/components/tool-states";

const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };

export const Route = createFileRoute("/centre-screening")({
  loader: () => loadCentreScreening().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Staff screening · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});

function Page() {
  return <CentreScreeningPage data={Route.useLoaderData()} locale="en" />;
}
