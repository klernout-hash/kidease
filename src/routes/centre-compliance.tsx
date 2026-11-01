import { createFileRoute } from "@tanstack/react-router";
import { CentreCalendarPage } from "@/components/compliance/calendar-page";
import { loadCentreCalendar } from "@/lib/server/compliance-calendar";

const EMPTY = { enabled: false as const, mode: "off" as const, centres: [], rows: [] };

export const Route = createFileRoute("/centre-compliance")({
  loader: () => loadCentreCalendar().catch(() => EMPTY),
  head: () => ({ meta: [{ title: "Compliance dates · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  return <CentreCalendarPage data={Route.useLoaderData()} locale="en" />;
}
