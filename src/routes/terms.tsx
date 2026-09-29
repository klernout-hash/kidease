import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-doc";
import { TERMS_EN, TERMS_FR } from "@/lib/legal-copy";
import { LEGAL_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { SMS_TERMS_EN, SMS_TERMS_FR, withSmsSection } from "@/lib/sms-legal";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/terms")({
  head: () => pageSeoHead(LEGAL_PAGE_SEO.terms),
  component: Terms,
});

function Terms() {
  const { locale } = useCopy();
  const doc =
    locale === "fr" ? withSmsSection(TERMS_FR, SMS_TERMS_FR) : withSmsSection(TERMS_EN, SMS_TERMS_EN);
  return <LegalPage doc={doc} />;
}
