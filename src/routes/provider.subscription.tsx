import { createFileRoute, Navigate } from "@tanstack/react-router";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";

/**
 * Old daycare plan links land on Today.
 * The daycare desk does not sell upgrades or open checkout.
 */
export const Route = createFileRoute("/provider/subscription")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
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
