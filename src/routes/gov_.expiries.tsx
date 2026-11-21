import { createFileRoute } from "@tanstack/react-router";
import { GovDashboardView } from "@/components/gov/gov-dashboard";
import { GovNativeNote } from "@/components/gov/gov-login";
import { govDeskSearch, govFilter } from "@/lib/gov/search";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { getGovDashboard } from "@/lib/server/gov-portal";

export const Route = createFileRoute("/gov_/expiries")({
  validateSearch: (search: Record<string, unknown>) => govDeskSearch(search, { tab: true }),
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loaderDeps: ({ search }) => ({ province: govFilter(search.province), region: govFilter(search.region), city: govFilter(search.city) }),
  loader: async ({ context, deps }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    return getGovDashboard({ data: { province: deps.province, region: deps.region, city: deps.city, locale: "en" } });
  },
  head: () => govRobotsHead("Expiries and alerts"),
  headers: govRobotsHeaders,
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="en" />;
  return <GovDashboardView data={data} section="expiries" />;
}
