import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/terms")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.terms),
  component: FrTerms,
});

function FrTerms() {
  return <LegalPage doc={TERMS_FR} />;
}
