import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { ClaimPage, claimValidateSearch } from "@/routes/claim";

export const Route = createFileRoute("/fr/claim")({
  validateSearch: claimValidateSearch,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.claim),
  component: FrClaim,
});

function FrClaim() {
  return <ClaimPage search={Route.useSearch()} />;
}
