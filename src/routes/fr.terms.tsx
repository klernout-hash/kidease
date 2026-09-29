import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { SMS_TERMS_FR, withSmsSection } from "@/lib/sms-legal";

export const Route = createFileRoute("/fr/terms")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO_FR.terms),
  component: FrTerms,
});

function FrTerms() {
  return <LegalPage doc={withSmsSection(TERMS_FR, SMS_TERMS_FR)} />;
}
