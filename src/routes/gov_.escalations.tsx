import { createFileRoute } from "@tanstack/react-router";
import { GovDeskUnavailable } from "@/components/page-not-found";
import { guardGovDesk } from "@/lib/gov/desk-guard";

/**
 * Not built yet. A signed-in official sees the same screen as any unknown /gov page,
 * in EN and FR, with no redirect (gov desk test #31). The desk guard still runs first.
 */
export const Route = createFileRoute("/gov_/escalations")({
  beforeLoad: async ({ context }) => {
    await guardGovDesk("en", Boolean((context as { nativeShell?: boolean }).nativeShell));
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: GovUnbuilt,
});

function GovUnbuilt() {
  return <GovDeskUnavailable locale="en" />;
}
