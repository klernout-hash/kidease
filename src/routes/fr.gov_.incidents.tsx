import { createFileRoute } from "@tanstack/react-router";
import { GovNativeNote } from "@/components/gov/gov-login";
import { GovIncidentsPage } from "@/components/compliance/incidents-page";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovIncidents } from "@/lib/server/compliance-incidents";

export const Route = createFileRoute("/fr/gov_/incidents")({
  beforeLoad: ({ context }) => guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => {
    if ((context as { nativeOnly?: boolean }).nativeOnly) return null;
    return loadGovIncidents();
  },
  head: () => govRobotsHead("Événements graves · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="fr" />;
  return <GovIncidentsPage data={data} locale="fr" />;
}
