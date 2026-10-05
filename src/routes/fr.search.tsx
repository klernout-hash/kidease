import { createFileRoute } from "@tanstack/react-router";
import { BootPending } from "@/components/boot-pending";
import { SearchScreen, searchLoader, searchPageHead, searchValidateSearch } from "@/routes/search";

export const Route = createFileRoute("/fr/search")({
  validateSearch: searchValidateSearch,
  loader: searchLoader,
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: BootPending,
  head: ({ loaderData }) => searchPageHead("fr", loaderData),
  component: FrSearch,
});

function FrSearch() {
  return <SearchScreen boot={Route.useLoaderData()} incoming={Route.useSearch()} />;
}
