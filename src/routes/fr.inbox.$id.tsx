import { createFileRoute } from "@tanstack/react-router";
import { parseInboxSearch } from "@/lib/inbox-view";
import { privateReturnPath } from "@/lib/role-access";
import { beforeLoadPrivate } from "@/lib/server/role-route";
import { InboxThreadPage } from "@/routes/inbox.$id";

export const Route = createFileRoute("/fr/inbox/$id")({
  beforeLoad: ({ context, location }) =>
    beforeLoadPrivate(privateReturnPath(location), (context as { roleChrome?: Parameters<typeof beforeLoadPrivate>[1] }).roleChrome),
  validateSearch: (s: Record<string, unknown>) => parseInboxSearch(s),
  component: FrInboxThreadRoute,
});

function FrInboxThreadRoute() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <InboxThreadPage id={id} search={search} />;
}
