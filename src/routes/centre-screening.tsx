import { createFileRoute } from "@tanstack/react-router";
import { CentreScreeningPage } from "@/components/compliance/screening-page";
import { loadCentreScreening } from "@/lib/server/compliance-screening";

const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };

export const Route = createFileRoute("/centre-screening")({
  loader: () => loadCentreScreening().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Staff screening · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  return <CentreScreeningPage data={Route.useLoaderData()} locale="en" />;
}
