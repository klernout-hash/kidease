import { createFileRoute } from "@tanstack/react-router";
import { parseInboxSearch } from "@/lib/inbox-view";
import { InboxThreadPage } from "@/routes/inbox.$id";

export const Route = createFileRoute("/fr/inbox/$id")({
  validateSearch: (s: Record<string, unknown>) => parseInboxSearch(s),
  component: FrInboxThreadRoute,
});

function FrInboxThreadRoute() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <InboxThreadPage id={id} search={search} />;
}
