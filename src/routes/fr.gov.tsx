import { createFileRoute } from "@tanstack/react-router";
import { GovDashboardView } from "@/components/gov/gov-dashboard";
import { GovNativeNote } from "@/components/gov/gov-login";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { govDeskSearch, govFilter } from "@/lib/gov/search";
import { getGovDashboard } from "@/lib/server/gov-portal";

export const Route = createFileRoute("/fr/gov")({
  validateSearch: (search: Record<string, unknown>) => govDeskSearch(search, { centre: true }),
  beforeLoad: ({ context }) => guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loaderDeps: ({ search }) => ({
    province: govFilter(search.province),
    region: govFilter(search.region),
    city: govFilter(search.city),
  }),
  loader: async ({ context, deps }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    return getGovDashboard({
      data: { province: deps.province, region: deps.region, city: deps.city, locale: "fr" },
    });
  },
  head: () => govRobotsHead("Aperçu"),
  headers: govRobotsHeaders,
  component: GovPageFr,
});

function GovPageFr() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="fr" />;
  return <GovDashboardView data={data} section="overview" />;
}
