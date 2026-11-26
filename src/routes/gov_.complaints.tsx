import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { guardGovDesk, govRobotsHead, govRobotsHeaders } from "@/lib/gov/desk-guard";
import { loadGovDeskPage } from "@/lib/server/gov-desk";

export const Route = createFileRoute("/gov_/complaints")({
  // All desk pages share one lazy screen chunk (client JS file budget).
  codeSplitGroupings: [],
  beforeLoad: ({ context }) => guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell)),
  loader: async ({ context }) => {
    const gate = context as { nativeOnly?: boolean };
    if (gate.nativeOnly) return null;
    return loadGovDeskPage({ data: { leaf: "complaints", locale: "en" } });
  },
  head: () => govRobotsHead("Complaints"),
  headers: govRobotsHeaders,
  component: lazyRouteComponent(() => import("@/components/gov/gov-desk-route"), "GovDeskRouteView"),
});
