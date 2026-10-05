import { createFileRoute } from "@tanstack/react-router";
import { getPlansGate } from "@/lib/server/ui-chrome";
import { PlansPage, plansHead } from "@/routes/plans";

export const Route = createFileRoute("/fr/plans")({
  loader: () => getPlansGate(),
  head: ({ loaderData }) => plansHead(Boolean(loaderData?.subscriptionsOn), "fr"),
  component: FrPlans,
});

function FrPlans() {
  return <PlansPage subscriptionsOn={Route.useLoaderData().subscriptionsOn} />;
}
