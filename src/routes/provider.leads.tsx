import { createFileRoute } from "@tanstack/react-router";
import { CentreLeadDesk, type CentreLeadPageData } from "@/components/centre-lead-desk";
import { centreLeadPage } from "@/lib/server/centre-leads";

const off = { enabled: false } satisfies CentreLeadPageData;

export const Route = createFileRoute("/provider/leads")({
  validateSearch: (search: Record<string, unknown>) => ({
    daycareId: typeof search.daycareId === "string" ? search.daycareId.slice(0, 80) : "",
  }),
  loaderDeps: ({ search }) => ({ daycareId: search.daycareId }),
  loader: ({ deps }) => centreLeadPage({ data: { daycareId: deps.daycareId } }).catch(() => off),
  head: () => ({
    meta: [
      { title: "Families · KidEase" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadsRoute,
});

function LeadsRoute() {
  const data = Route.useLoaderData();
  return <CentreLeadDesk initial={data} />;
}

export function ProviderLeadsPage() {
  const data = Route.useLoaderData();
  return <CentreLeadDesk initial={data} />;
}
