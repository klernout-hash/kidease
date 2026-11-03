import { createFileRoute } from "@tanstack/react-router";
import { CentreFeesPage } from "@/components/compliance/fees-page";
import { loadCentreFees } from "@/lib/server/compliance-fees";
import { ToolError, ToolPending } from "@/components/tool-states";
const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };
export const Route = createFileRoute("/centre-fee-caps")({
  loader: () => loadCentreFees().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Fee caps · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});
function Page() { return <CentreFeesPage data={Route.useLoaderData()} locale="en" />; }
