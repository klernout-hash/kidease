import { createFileRoute } from "@tanstack/react-router";
import { GovExportsPage } from "@/components/gov/gov-exports";
import { GovNativeNote } from "@/components/gov/gov-login";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { getGovDashboard } from "@/lib/server/gov-portal";

export const Route = createFileRoute("/fr/gov_/exports")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: typeof search.province === "string" ? search.province : "",
    region: typeof search.region === "string" ? search.region : "",
    city: typeof search.city === "string" ? search.city : "",
  }),
  beforeLoad: ({ context }) => guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context, location }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    const search = location.search as { province?: string; region?: string; city?: string };
    return getGovDashboard({
      data: { province: search.province, region: search.region, city: search.city, locale: "fr" },
    });
  },
  head: () => govRobotsHead("Exportations · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="fr" />;
  return <GovExportsPage data={data} />;
}
