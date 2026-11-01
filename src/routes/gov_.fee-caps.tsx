import { createFileRoute } from "@tanstack/react-router";
import { GovNativeNote } from "@/components/gov/gov-login";
import { GovFeesPage } from "@/components/compliance/fees-page";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovFees } from "@/lib/server/compliance-fees";
export const Route = createFileRoute("/gov_/fee-caps")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => ((context as { nativeOnly?: boolean }).nativeOnly ? null : loadGovFees()),
  head: () => govRobotsHead("Fee caps · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});
function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="en" />;
  return <GovFeesPage data={data} locale="en" />;
}
