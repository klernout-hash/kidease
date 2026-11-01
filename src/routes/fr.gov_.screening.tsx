import { createFileRoute } from "@tanstack/react-router";
import { GovNativeNote } from "@/components/gov/gov-login";
import { GovScreeningPage } from "@/components/compliance/screening-page";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovScreening } from "@/lib/server/compliance-screening";

export const Route = createFileRoute("/fr/gov_/screening")({
  beforeLoad: ({ context }) => guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => ((context as { nativeOnly?: boolean }).nativeOnly ? null : loadGovScreening()),
  head: () => govRobotsHead("Vérifications du personnel · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});

function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="fr" />;
  return <GovScreeningPage data={data} locale="fr" />;
}
