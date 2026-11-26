import { createFileRoute } from "@tanstack/react-router";
import { GovDeskUnavailable } from "@/components/page-not-found";

/**
 * Not built yet. Same screen as any unknown /gov page, signed in or not, in EN and FR,
 * with no redirect (gov desk test #31). The screen shows no desk data, so no guard.
 */
export const Route = createFileRoute("/gov_/change-requests")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: GovUnbuilt,
});

function GovUnbuilt() {
  return <GovDeskUnavailable locale="en" />;
}
