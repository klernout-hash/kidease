import { createFileRoute } from "@tanstack/react-router";
import { CentreLeadDesk, type CentreLeadPageData } from "@/components/centre-lead-desk";
import { privateReturnPath } from "@/lib/role-access";
import { leadsPageSearch } from "@/lib/centre-leads";
import { centreLeadPage } from "@/lib/server/centre-leads";
import { beforeLoadPrivate } from "@/lib/server/role-route";

const off = { enabled: false } satisfies CentreLeadPageData;

export const Route = createFileRoute("/provider/leads")({
  beforeLoad: ({ context, location }) => beforeLoadPrivate(privateReturnPath(location), context.roleChrome),
  validateSearch: (search: Record<string, unknown>) => leadsPageSearch(search),
  loaderDeps: ({ search }) => ({ daycareId: search.daycareId || "" }),
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
