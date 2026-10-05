import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { UnsubscribePage, unsubscribeValidateSearch } from "@/routes/unsubscribe";

export const Route = createFileRoute("/fr/unsubscribe")({
  validateSearch: unsubscribeValidateSearch,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.unsubscribe),
  component: FrUnsubscribe,
});

function FrUnsubscribe() {
  return <UnsubscribePage search={Route.useSearch()} />;
}
