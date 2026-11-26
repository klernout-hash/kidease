import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovDeskPage } from "@/lib/server/gov-desk";

export const Route = createFileRoute("/fr/gov_/fee-caps")({
  // All desk pages share one lazy screen chunk (client JS file budget).
  codeSplitGroupings: [],
  beforeLoad: ({ context }) => guardGovDesk("fr", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    return loadGovDeskPage({ data: { leaf: "fee-caps", locale: "fr" } });
  },
  head: () => govRobotsHead("Plafonds de tarifs"),
  headers: govRobotsHeaders,
  component: lazyRouteComponent(() => import("@/components/gov/gov-desk-route"), "GovDeskRouteView"),
});
