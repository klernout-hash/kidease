import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPlansGate } from "@/lib/server/ui-chrome";
import { PlansPage, plansHead } from "@/routes/plans";

export const Route = createFileRoute("/fr/plans")({
  loader: async () => {
    const gate = await getPlansGate();
    if (!gate.subscriptionsOn) throw redirect({ to: "/fr" });
    return gate;
  },
  head: ({ loaderData }) => plansHead(Boolean(loaderData?.subscriptionsOn), "fr"),
  component: FrPlans,
});

function FrPlans() {
  return <PlansPage subscriptionsOn={Route.useLoaderData().subscriptionsOn} />;
}
