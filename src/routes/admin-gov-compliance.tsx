import { createFileRoute } from "@tanstack/react-router";
import { GovCalendarPage } from "@/components/compliance/calendar-page";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { loadAdminCalendar } from "@/lib/server/compliance-calendar";

export const Route = createFileRoute("/admin-gov-compliance")({
  beforeLoad: beforeLoadAdminDesk,
  loader: () => loadAdminCalendar({ data: { province: "ON" } }),
  head: () => ({ meta: [{ title: "Compliance dates · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  return <GovCalendarPage data={Route.useLoaderData()} locale="en" />;
}
