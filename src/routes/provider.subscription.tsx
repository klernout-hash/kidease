import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";

/**
 * Old daycare plan links land on Today.
 * This route does not sell an upgrade or open checkout, with plans on or off.
 * Leave in beforeLoad. The screen chunk is split out of the shell, so a
 * client Navigate can miss the first load and the URL stays here.
 */
function redirectToProviderToday(): never {
  throw redirect({ to: "/provider", search: { desk: "today" } });
}

export const Route = createFileRoute("/provider/subscription")({
  beforeLoad: ({ context, location }) => {
    const chrome = (context as { roleChrome?: { subscriptionsEnabled?: boolean } }).roleChrome;
    beforeLoadPrivate(privateReturnPath(location), context.roleChrome);
    if (chrome?.subscriptionsEnabled !== true) redirectToProviderToday();
    redirectToProviderToday();
  },
  head: () => ({
    meta: [
      { title: "Daycare desk · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProviderSubscriptionPage,
});

function ProviderSubscriptionPage() {
  return <Navigate to="/provider" search={{ desk: "today" }} />;
}
