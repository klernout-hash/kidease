import { createFileRoute } from "@tanstack/react-router";
import { CentreRatiosPage } from "@/components/compliance/ratios-page";
import { loadCentreRatios } from "@/lib/server/compliance-ratios";
import { ToolError, ToolPending } from "@/components/tool-states";
const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };
export const Route = createFileRoute("/centre-ratios")({
  loader: () => loadCentreRatios().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Room ratios · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});
function Page() { return <CentreRatiosPage data={Route.useLoaderData()} locale="en" />; }
