import { createFileRoute } from "@tanstack/react-router";
import { CentreRatiosPage } from "@/components/compliance/ratios-page";
import { loadCentreRatios } from "@/lib/server/compliance-ratios";
const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };
export const Route = createFileRoute("/centre-ratios")({
  loader: () => loadCentreRatios().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Room ratios · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});
function Page() { return <CentreRatiosPage data={Route.useLoaderData()} locale="en" />; }
