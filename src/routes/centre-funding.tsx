import { createFileRoute } from "@tanstack/react-router";
import { CentreFundingPage } from "@/components/compliance/funding-page";
import { loadCentreFunding } from "@/lib/server/compliance-funding";
import { ToolError, ToolPending } from "@/components/tool-states";
const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], report: null };
export const Route = createFileRoute("/centre-funding")({
  loader: () => loadCentreFunding().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Funding report · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: ToolPending,
  errorComponent: ToolError,
  component: Page,
});
function Page() { return <CentreFundingPage data={Route.useLoaderData()} locale="en" />; }
