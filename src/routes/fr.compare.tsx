import { createFileRoute } from "@tanstack/react-router";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { ComparePage, compareValidateSearch } from "@/routes/compare";

export const Route = createFileRoute("/fr/compare")({
  validateSearch: compareValidateSearch,
  head: () => pageSeoHead(MARKETING_PAGE_SEO_FR.compare),
  component: FrCompare,
});

function FrCompare() {
  return <ComparePage slugs={Route.useSearch().slugs} />;
}
