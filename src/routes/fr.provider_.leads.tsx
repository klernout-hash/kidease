import { createFileRoute } from "@tanstack/react-router";
import { CentreLeadDesk } from "@/components/centre-lead-desk";
import { centreLeadPage } from "@/lib/server/centre-leads";

export const Route = createFileRoute("/fr/provider_/leads")({
  validateSearch: (search: Record<string, unknown>) => ({
    daycareId: typeof search.daycareId === "string" ? search.daycareId.slice(0, 80) : "",
  }),
  loaderDeps: ({ search }) => ({ daycareId: search.daycareId }),
  loader: ({ deps }) => centreLeadPage({ data: { daycareId: deps.daycareId } }).catch(() => ({ enabled: false as const })),
  head: () => ({
    meta: [
      { title: "Familles · KidEase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FrenchLeadsRoute,
});

function FrenchLeadsRoute() {
  const data = Route.useLoaderData();
  return <CentreLeadDesk initial={data} />;
}
