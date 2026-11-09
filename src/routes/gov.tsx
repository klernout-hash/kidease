import { createFileRoute } from "@tanstack/react-router";
import { GovDashboardView } from "@/components/gov/gov-dashboard";
import { GovNativeNote } from "@/components/gov/gov-login";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { getGovDashboard } from "@/lib/server/gov-portal";

export const Route = createFileRoute("/gov")({
  validateSearch: (search: Record<string, unknown>) => ({
    province: typeof search.province === "string" ? search.province : "",
    region: typeof search.region === "string" ? search.region : "",
    city: typeof search.city === "string" ? search.city : "",
  }),
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loaderDeps: ({ search }) => ({
    province: search.province,
    region: search.region,
    city: search.city,
  }),
  loader: async ({ context, deps }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    return getGovDashboard({
      data: { province: deps.province, region: deps.region, city: deps.city, locale: "en" },
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
