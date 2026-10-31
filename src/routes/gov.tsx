import { createFileRoute } from "@tanstack/react-router";
import { GovDashboardView } from "@/components/gov/gov-dashboard";
import { GovNativeNote } from "@/components/gov/gov-login";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { getGovDashboard } from "@/lib/server/gov-portal.server";

export const Route = createFileRoute("/gov")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: typeof search.province === "string" ? search.province : "",
    region: typeof search.region === "string" ? search.region : "",
    city: typeof search.city === "string" ? search.city : "",
  }),
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context, location }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    const search = location.search as { province?: string; region?: string; city?: string };
    return getGovDashboard({
      data: { province: search.province, region: search.region, city: search.city, locale: "en" },
    });
  },
  head: () => govRobotsHead("Government desk · KidEase"),
  headers: govRobotsHeaders,
  component: GovPage,
});

function GovPage() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="en" />;
  return <GovDashboardView data={data} />;
}
