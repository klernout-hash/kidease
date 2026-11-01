import { createFileRoute } from "@tanstack/react-router";
import { GovNativeNote } from "@/components/gov/gov-login";
import { GovRatiosPage } from "@/components/compliance/ratios-page";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovRatios } from "@/lib/server/compliance-ratios";
export const Route = createFileRoute("/gov_/ratios")({
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => ((context as { nativeOnly?: boolean }).nativeOnly ? null : loadGovRatios()),
  head: () => govRobotsHead("Room ratios · KidEase"),
  headers: govRobotsHeaders,
  component: Page,
});
function Page() {
  const gate = Route.useRouteContext() as { nativeOnly?: boolean };
  const data = Route.useLoaderData();
  if (gate.nativeOnly || !data) return <GovNativeNote locale="en" />;
  return <GovRatiosPage data={data} locale="en" />;
}
