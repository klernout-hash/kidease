import { createFileRoute } from "@tanstack/react-router";
import { GovNativeNote } from "@/components/gov/gov-login";
import { GovBroadcastPage } from "@/components/compliance/broadcast-page";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovBroadcasts } from "@/lib/server/compliance-broadcast";
export const Route = createFileRoute("/fr/gov_/broadcasts")({
  beforeLoad: ({ context }) => guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => ((context as { nativeOnly?: boolean }).nativeOnly ? null : loadGovBroadcasts()),
  head: () => govRobotsHead("Avis d’urgence · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});
function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="fr" />;
  return <GovBroadcastPage data={data} locale="fr" />;
}
